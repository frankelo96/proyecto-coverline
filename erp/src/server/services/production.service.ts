/**
 * Órdenes de producción: lanzamiento, corte, remitos a talleres, control de
 * calidad e ingreso a stock. Cada operación corre dentro de una transacción y
 * bloquea la fila de la orden (SELECT … FOR UPDATE) para evitar dobles
 * registros concurrentes.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { ProductionStage } from "@/generated/prisma/enums";
import {
  assertCanCancel,
  assertCanCloseCut,
  assertCanCloseQuality,
  assertCanReceive,
  assertCanSend,
  assertCanSkipPersonalization,
  assertCanStart,
  isStageComplete,
  nextStage,
  stageBalance,
  STAGE_LABELS,
  WorkflowError,
  type OrderLike,
} from "@/lib/production/workflow";
import { formatMoney } from "@/lib/format";
import type { CreateOrderInput } from "@/lib/validations/production";

type Tx = Prisma.TransactionClient;

/** Plazo de pago a talleres por fasón. */
export const WORKSHOP_PAYMENT_TERM_DAYS = 30;

const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      remits: { select: { type: true, stage: true, workshopId: true, pieces: true, wasteQty: true } },
      items: true,
    },
  });
  if (!order) throw new WorkflowError("Orden inexistente");
  return order;
}

const asOrderLike = (o: Awaited<ReturnType<typeof lockOrder>>): OrderLike => ({
  status: o.status,
  currentStage: o.currentStage,
  quantityInProcess: o.quantityInProcess,
  requiresPersonalization: o.requiresPersonalization,
  remits: o.remits,
});

async function logStage(
  tx: Tx,
  data: {
    orderId: string;
    from: ProductionStage | null;
    to: ProductionStage;
    quantityIn: number;
    quantityOut: number;
    wasteQty?: number;
    workshopId?: string | null;
    userId: string;
    notes?: string | null;
  },
) {
  await tx.productionStageLog.create({
    data: {
      productionOrderId: data.orderId,
      fromStage: data.from,
      toStage: data.to,
      quantityIn: data.quantityIn,
      quantityOut: data.quantityOut,
      wasteQty: data.wasteQty ?? 0,
      workshopId: data.workshopId ?? null,
      userId: data.userId,
      notes: data.notes ?? null,
    },
  });
}

export async function createProductionOrder(tx: Tx, input: CreateOrderInput, userId: string) {
  const product = await tx.product.findUnique({
    where: { id: input.productId },
    include: { variants: { where: { active: true }, select: { id: true } } },
  });
  if (!product || !product.active) throw new WorkflowError("Producto inexistente o inactivo");
  const validVariants = new Set(product.variants.map((v) => v.id));
  const items = input.items.filter((i) => i.quantity > 0);
  for (const i of items) if (!validVariants.has(i.variantId)) throw new WorkflowError("Talle inválido para el producto");
  if (new Set(items.map((i) => i.variantId)).size !== items.length) throw new WorkflowError("Hay talles repetidos");

  if (input.clientId) {
    const client = await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
    if (!client) throw new WorkflowError("Cliente inexistente");
  }

  const quantityPlanned = items.reduce((a, i) => a + i.quantity, 0);
  return tx.productionOrder.create({
    data: {
      productId: product.id,
      clientId: input.clientId,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes,
      requiresPersonalization: input.requiresPersonalization,
      quantityPlanned,
      estimatedUnitCost: product.currentCost,
      createdById: userId,
      items: { create: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
    },
    select: { id: true, number: true },
  });
}

export interface MaterialShortage {
  code: string;
  name: string;
  required: number;
  available: number;
}

/**
 * Lanza la orden al corte: descuenta del stock el consumo bruto de la ficha
 * técnica (consumo × (1 + merma) × cantidad) y lo suma al costo real.
 * Devuelve los faltantes para avisar (el stock puede quedar negativo).
 */
export async function startProductionOrder(tx: Tx, orderId: string, userId: string) {
  const order = await lockOrder(tx, orderId);
  assertCanStart(order);
  const bom = await tx.productBOM.findMany({ where: { productId: order.productId }, include: { rawMaterial: true } });
  if (bom.length === 0) throw new WorkflowError("El producto no tiene ficha técnica cargada");

  let materialsCost = new Decimal(0);
  const shortages: MaterialShortage[] = [];
  for (const line of bom) {
    const required = new Decimal(line.quantity.toString())
      .mul(new Decimal(100).plus(line.wastePct.toString()).div(100))
      .mul(order.quantityPlanned)
      .toDecimalPlaces(4);
    const available = new Decimal(line.rawMaterial.stockQty.toString());
    if (available.lt(required)) {
      shortages.push({ code: line.rawMaterial.code, name: line.rawMaterial.name, required: required.toNumber(), available: available.toNumber() });
    }
    materialsCost = materialsCost.plus(required.mul(line.rawMaterial.currentCost.toString()));
    await tx.rawMaterial.update({ where: { id: line.rawMaterialId }, data: { stockQty: { decrement: D(required) } } });
  }

  await tx.productionOrder.update({
    where: { id: order.id },
    data: {
      status: "EN_PROCESO",
      currentStage: "CORTE_INTERNO",
      quantityInProcess: order.quantityPlanned,
      startedAt: new Date(),
      actualCost: { increment: D(materialsCost.toDecimalPlaces(2)) },
    },
  });
  await logStage(tx, {
    orderId: order.id,
    from: null,
    to: "CORTE_INTERNO",
    quantityIn: order.quantityPlanned,
    quantityOut: order.quantityPlanned,
    userId,
    notes: `Materiales consumidos: ${formatMoney(materialsCost.toDecimalPlaces(2).toNumber())}`,
  });
  return { shortages };
}

export async function closeCut(tx: Tx, input: { orderId: string; cutPieces: number; notes: string | null }, userId: string) {
  const order = await lockOrder(tx, input.orderId);
  assertCanCloseCut(asOrderLike(order), input.cutPieces);
  const waste = order.quantityInProcess - input.cutPieces;
  await tx.productionOrder.update({
    where: { id: order.id },
    data: { quantityInProcess: input.cutPieces, currentStage: "EN_TALLER_CONFECCION" },
  });
  await logStage(tx, {
    orderId: order.id,
    from: "CORTE_INTERNO",
    to: "EN_TALLER_CONFECCION",
    quantityIn: order.quantityInProcess,
    quantityOut: input.cutPieces,
    wasteQty: waste,
    userId,
    notes: input.notes,
  });
}

export async function sendToWorkshop(
  tx: Tx,
  input: { orderId: string; workshopId: string; pieces: number; notes: string | null },
  userId: string,
) {
  const order = await lockOrder(tx, input.orderId);
  const workshop = await tx.workshop.findUnique({ where: { id: input.workshopId } });
  if (!workshop || !workshop.active) throw new WorkflowError("Taller inexistente o inactivo");
  assertCanSend(asOrderLike(order), input.pieces, workshop.types);
  return tx.workshopRemit.create({
    data: {
      type: "ENVIO",
      workshopId: workshop.id,
      productionOrderId: order.id,
      stage: order.currentStage,
      pieces: input.pieces,
      notes: input.notes,
      createdById: userId,
    },
    select: { id: true, number: true },
  });
}

/**
 * Recepción desde taller: registra piezas buenas y merma, genera la deuda de
 * fasón (piezas buenas × tarifa) y, si volvió todo, avanza la etapa.
 */
export async function receiveFromWorkshop(
  tx: Tx,
  input: { orderId: string; workshopId: string; pieces: number; wasteQty: number; laborUnitCost: number; notes: string | null },
  userId: string,
) {
  const order = await lockOrder(tx, input.orderId);
  const before = asOrderLike(order);
  assertCanReceive(before, input.workshopId, input.pieces, input.wasteQty);
  const workshop = await tx.workshop.findUniqueOrThrow({ where: { id: input.workshopId } });

  const laborTotal = new Decimal(input.laborUnitCost).mul(input.pieces).toDecimalPlaces(2);
  const remit = await tx.workshopRemit.create({
    data: {
      type: "RECEPCION",
      workshopId: workshop.id,
      productionOrderId: order.id,
      stage: order.currentStage,
      pieces: input.pieces,
      wasteQty: input.wasteQty,
      laborUnitCost: D(input.laborUnitCost),
      laborTotal: D(laborTotal),
      notes: input.notes,
      createdById: userId,
    },
    select: { id: true, number: true },
  });

  if (laborTotal.gt(0)) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + WORKSHOP_PAYMENT_TERM_DAYS);
    await tx.accountPayable.create({
      data: {
        workshopId: workshop.id,
        workshopRemitId: remit.id,
        description: `Fasón ${STAGE_LABELS[order.currentStage].toLowerCase()} OP #${order.number} — remito #${remit.number} (${input.pieces} u.)`,
        dueDate,
        amount: D(laborTotal),
        balance: D(laborTotal),
      },
    });
  }

  const after: OrderLike = {
    ...before,
    quantityInProcess: before.quantityInProcess - input.wasteQty,
    remits: [...before.remits, { type: "RECEPCION", stage: order.currentStage, workshopId: workshop.id, pieces: input.pieces, wasteQty: input.wasteQty }],
  };
  const complete = isStageComplete(after);
  const to = complete ? nextStage(order.currentStage, order.requiresPersonalization) : order.currentStage;

  await tx.productionOrder.update({
    where: { id: order.id },
    data: {
      quantityInProcess: after.quantityInProcess,
      actualCost: { increment: D(laborTotal) },
      currentStage: to,
    },
  });

  if (complete) {
    const b = stageBalance(after, order.currentStage);
    await logStage(tx, {
      orderId: order.id,
      from: order.currentStage,
      to,
      quantityIn: b.sent,
      quantityOut: b.received,
      wasteQty: b.waste,
      userId,
      notes: `Etapa cerrada con remito #${remit.number}`,
    });
  }
  return { remit, advancedTo: complete ? to : null };
}

export async function skipPersonalization(tx: Tx, orderId: string, userId: string) {
  const order = await lockOrder(tx, orderId);
  assertCanSkipPersonalization(asOrderLike(order));
  await tx.productionOrder.update({ where: { id: order.id }, data: { currentStage: "CONTROL_CALIDAD_PLANCHADO", requiresPersonalization: false } });
  await logStage(tx, {
    orderId: order.id,
    from: "EN_PERSONALIZACION",
    to: "CONTROL_CALIDAD_PLANCHADO",
    quantityIn: order.quantityInProcess,
    quantityOut: order.quantityInProcess,
    userId,
    notes: "Personalización omitida",
  });
}

/** Cierre de calidad: aprobadas por talle ingresan al stock de la variante; el resto es merma. */
export async function closeQuality(
  tx: Tx,
  input: { orderId: string; approved: { variantId: string; quantity: number }[]; notes: string | null },
  userId: string,
) {
  const order = await lockOrder(tx, input.orderId);
  const planned = new Map(order.items.map((i) => [i.variantId, i.quantity]));
  assertCanCloseQuality(asOrderLike(order), input.approved, planned);

  const total = input.approved.reduce((a, i) => a + i.quantity, 0);
  for (const a of input.approved) {
    const item = order.items.find((i) => i.variantId === a.variantId)!;
    await tx.productionOrderItem.update({ where: { id: item.id }, data: { quantityFinished: a.quantity } });
    if (a.quantity > 0) {
      await tx.productVariant.update({ where: { id: a.variantId }, data: { stockQty: { increment: a.quantity } } });
    }
  }
  await tx.productionOrder.update({
    where: { id: order.id },
    data: {
      status: "COMPLETADA",
      currentStage: "LISTO_ENTREGA",
      quantityFinished: total,
      quantityInProcess: total,
      completedAt: new Date(),
    },
  });
  await logStage(tx, {
    orderId: order.id,
    from: "CONTROL_CALIDAD_PLANCHADO",
    to: "LISTO_ENTREGA",
    quantityIn: order.quantityInProcess,
    quantityOut: total,
    wasteQty: order.quantityInProcess - total,
    userId,
    notes: input.notes,
  });
  return { finished: total };
}

export async function cancelOrder(tx: Tx, input: { orderId: string; reason: string }, userId: string) {
  const order = await lockOrder(tx, input.orderId);
  assertCanCancel(asOrderLike(order));
  await tx.productionOrder.update({ where: { id: order.id }, data: { status: "CANCELADA" } });
  await tx.auditLog.create({
    data: {
      userId,
      entity: "ProductionOrder",
      entityId: order.id,
      action: "CANCEL",
      reason: input.reason,
      data: { number: order.number, stage: order.currentStage, quantityInProcess: order.quantityInProcess },
    },
  });
}
