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
import { startOfLocalDay } from "@/lib/dates";
import { formatMoney, formatNumber } from "@/lib/format";
import type { CreateBatchInput, CreateOrderInput } from "@/lib/validations/production";
import { type MaterialAlternative, orderConsumption } from "@/lib/production/consumption";
import { moveRawMaterial, netConsumptionOfOrder } from "@/server/services/materials.service";
import { adjustBranchStock, mainBranchId, wholesaleBranchId } from "@/server/services/stock.service";

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

/** "AAAA-MM-DD" del formulario = medianoche argentina, para que no se muestre un día antes. */
function parseDueDate(v: string | null) {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? startOfLocalDay(v) : new Date(v);
}

export async function createProductionOrder(tx: Tx, input: CreateOrderInput, userId: string, batchId: string | null = null) {
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
      dueDate: parseDueDate(input.dueDate),
      notes: input.notes,
      requiresPersonalization: input.requiresPersonalization,
      batchId,
      quantityPlanned,
      estimatedUnitCost: product.currentCost,
      createdById: userId,
      items: { create: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
    },
    select: { id: true, number: true },
  });
}

/** Crea el comprobante y una orden de producción por cada producto cargado. */
export async function createProductionBatch(tx: Tx, input: CreateBatchInput, userId: string) {
  if (input.clientId) {
    const client = await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
    if (!client) throw new WorkflowError("Cliente inexistente");
  }
  const batch = await tx.productionBatch.create({
    data: { clientId: input.clientId, dueDate: parseDueDate(input.dueDate), notes: input.notes, createdById: userId },
    select: { id: true, number: true },
  });
  const orders = [];
  for (const p of input.products) {
    orders.push(
      await createProductionOrder(
        tx,
        { productId: p.productId, clientId: input.clientId, dueDate: input.dueDate, notes: input.notes, requiresPersonalization: p.requiresPersonalization, items: p.items },
        userId,
        batch.id,
      ),
    );
  }
  return { ...batch, orders };
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
  const [bom, rules, variants] = await Promise.all([
    tx.productBOM.findMany({ where: { productId: order.productId } }),
    tx.productMaterialRule.findMany({ where: { productId: order.productId } }),
    tx.productVariant.findMany({ where: { id: { in: order.items.map((i) => i.variantId) } }, select: { id: true, size: true, color: true, fabric: true } }),
  ]);
  if (bom.length === 0) throw new WorkflowError("El producto no tiene ficha técnica cargada");

  // Consumo por talle, color y tela de cada variante (tela alternativa según el color, consumo según el talle).
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const consumption = orderConsumption(
    bom.map((b) => ({ rawMaterialId: b.rawMaterialId, quantity: b.quantity.toNumber(), wastePct: b.wastePct.toNumber() })),
    new Map(rules.map((r) => [r.rawMaterialId, { sizeQuantities: r.sizeQuantities as Record<string, number> | null, alternatives: r.alternatives as MaterialAlternative[] | null }])),
    order.items.map((i) => ({ size: byVariant.get(i.variantId)?.size ?? "", color: byVariant.get(i.variantId)?.color ?? null, fabric: byVariant.get(i.variantId)?.fabric ?? null, quantity: i.quantity })),
  );
  const materials = await tx.rawMaterial.findMany({ where: { id: { in: [...consumption.keys()] } } });

  let materialsCost = new Decimal(0);
  const shortages: MaterialShortage[] = [];
  for (const m of materials) {
    const required = new Decimal(consumption.get(m.id) ?? 0);
    if (required.lte(0)) continue;
    const available = new Decimal(m.stockQty.toString());
    if (available.lt(required)) {
      shortages.push({ code: m.code, name: m.name, required: required.toNumber(), available: available.toNumber() });
    }
    materialsCost = materialsCost.plus(required.mul(m.currentCost.toString()));
    await moveRawMaterial(tx, { rawMaterialId: m.id, delta: D(required.neg()), reason: "CONSUMO_OP", refType: "OP", refId: order.id, unitCost: m.currentCost, userId, notes: `OP #${order.number}` });
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

export async function closeCut(
  tx: Tx,
  input: { orderId: string; cutPieces: number; notes: string | null; materialsUsed?: { rawMaterialId: string; quantity: number }[] },
  userId: string,
) {
  const order = await lockOrder(tx, input.orderId);
  assertCanCloseCut(asOrderLike(order), input.cutPieces);
  const waste = order.quantityInProcess - input.cutPieces;

  // Tela real vs. teórica: lo que sobró vuelve al stock y lo que faltó se descuenta (ajuste de corte).
  const adjustments: string[] = [];
  let costDelta = new Decimal(0);
  if (input.materialsUsed?.length) {
    const consumed = new Map((await netConsumptionOfOrder(tx, order.id)).map((c) => [c.rawMaterialId, c.consumed]));
    const materials = new Map((await tx.rawMaterial.findMany({ where: { id: { in: input.materialsUsed.map((m) => m.rawMaterialId) } } })).map((m) => [m.id, m]));
    for (const used of input.materialsUsed) {
      const theoretical = consumed.get(used.rawMaterialId);
      const m = materials.get(used.rawMaterialId);
      if (!theoretical || !m) throw new WorkflowError("Ese material no se consumió en esta orden");
      const leftover = theoretical.minus(used.quantity); // positivo: sobró; negativo: se usó de más
      if (leftover.abs().lt(0.0001)) continue;
      const last = await tx.rawMaterialMovement.findFirst({ where: { refType: "OP", refId: order.id, rawMaterialId: m.id, reason: "CONSUMO_OP" }, orderBy: { createdAt: "desc" } });
      const unitCost = last?.unitCost ?? m.currentCost;
      await moveRawMaterial(tx, { rawMaterialId: m.id, delta: leftover, reason: "AJUSTE_CORTE", refType: "OP", refId: order.id, unitCost, userId, notes: `Corte OP #${order.number}: teórico ${theoretical.toNumber()}, real ${used.quantity}` });
      costDelta = costDelta.minus(leftover.mul(unitCost.toString()));
      adjustments.push(`${m.name}: ${leftover.gt(0) ? "sobraron" : "faltaron"} ${formatNumber(leftover.abs().toDecimalPlaces(2).toNumber())} ${m.uom.toLowerCase()}`);
    }
  }
  await tx.productionOrder.update({
    where: { id: order.id },
    data: { quantityInProcess: input.cutPieces, currentStage: "EN_TALLER_CONFECCION", ...(costDelta.isZero() ? {} : { actualCost: { increment: D(costDelta.toDecimalPlaces(2)) } }) },
  });
  await logStage(tx, {
    orderId: order.id,
    from: "CORTE_INTERNO",
    to: "EN_TALLER_CONFECCION",
    quantityIn: order.quantityInProcess,
    quantityOut: input.cutPieces,
    wasteQty: waste,
    userId,
    notes: [input.notes, adjustments.length ? `Ajuste de tela: ${adjustments.join("; ")}` : null].filter(Boolean).join(" · ") || null,
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
    // Plazo de pago del taller (si no tiene uno cargado, el general).
    dueDate.setDate(dueDate.getDate() + (workshop.paymentTermDays > 0 ? workshop.paymentTermDays : WORKSHOP_PAYMENT_TERM_DAYS));
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
  // Pedido de un cliente (personalizado) → stock mayorista; producción para stock → local principal.
  const destination = order.clientId ? await wholesaleBranchId(tx) : await mainBranchId(tx);
  for (const a of input.approved) {
    const item = order.items.find((i) => i.variantId === a.variantId)!;
    await tx.productionOrderItem.update({ where: { id: item.id }, data: { quantityFinished: a.quantity } });
    if (a.quantity > 0) {
      await adjustBranchStock(tx, a.variantId, destination, a.quantity, { reason: "PRODUCCION", refType: "OP", refId: order.id, userId, notes: `OP #${order.number}` });
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

export async function cancelOrder(tx: Tx, input: { orderId: string; reason: string; returnMaterials: boolean }, userId: string) {
  const order = await lockOrder(tx, input.orderId);
  assertCanCancel(asOrderLike(order));
  // Si la tela/avíos no se llegaron a usar (ej. se cancela antes de cortar), vuelven al stock y se descuentan del costo real.
  let returned = new Decimal(0);
  if (input.returnMaterials) {
    for (const r of await netConsumptionOfOrder(tx, order.id)) {
      const last = await tx.rawMaterialMovement.findFirst({ where: { refType: "OP", refId: order.id, rawMaterialId: r.rawMaterialId, reason: "CONSUMO_OP" }, orderBy: { createdAt: "desc" } });
      const unitCost = last?.unitCost ?? new Prisma.Decimal(0);
      await moveRawMaterial(tx, { rawMaterialId: r.rawMaterialId, delta: r.consumed, reason: "DEVOLUCION_OP", refType: "OP", refId: order.id, unitCost, userId, notes: `Cancelación OP #${order.number}` });
      returned = returned.plus(new Decimal(r.consumed.toString()).mul(unitCost.toString()));
    }
  }
  await tx.productionOrder.update({
    where: { id: order.id },
    data: { status: "CANCELADA", ...(returned.gt(0) ? { actualCost: { decrement: D(returned.toDecimalPlaces(2)) } } : {}) },
  });
  await tx.auditLog.create({
    data: {
      userId,
      entity: "ProductionOrder",
      entityId: order.id,
      action: "CANCEL",
      reason: input.reason,
      data: { number: order.number, stage: order.currentStage, quantityInProcess: order.quantityInProcess, materialsReturned: returned.toNumber() },
    },
  });
}
