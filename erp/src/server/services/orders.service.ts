/**
 * Pedidos de clientes con seña.
 *  - Se toma el pedido con el precio acordado (lista del cliente; un precio menor exige permiso de descuento).
 *  - Las señas se cobran por caja como cualquier cobro y quedan ligadas al pedido.
 *  - Se pueden lanzar órdenes de producción para el cliente (ingresan al stock mayorista).
 *  - Al entregar se genera la venta: lo señado se aplica como "Seña a cuenta" y se cobra el saldo.
 *  - Al cancelar, la seña se devuelve, se convierte en vale o se retiene.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { InvoiceType } from "@/generated/prisma/enums";
import { isFiscal } from "@/lib/arca/codes";
import { variantLabel } from "@/lib/catalog/variants";
import { formatMoney, formatNumber } from "@/lib/format";
import { listFinalPrice } from "@/lib/pos/price-lists";
import { addDays, computeSaleTotals, planPayments, SaleError } from "@/lib/pos/sale-math";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import type { CancelOrderInput, CreateOrderInput, DeliverInput, DepositInput } from "@/lib/validations/orders";
import type { CollectionPayment } from "@/lib/validations/treasury";
import { registerCollections } from "@/server/services/collection.service";
import { clientOpenBalance, nextInternalNumber } from "@/server/services/pos.service";
import { priceListRule } from "@/server/services/price-lists.service";
import { createProductionOrder } from "@/server/services/production.service";
import { adjustBranchStock } from "@/server/services/stock.service";
import { issueStoreCredit } from "@/server/services/store-credit.service";
import { addMovement, lockRegister, openSessionOf } from "@/server/services/treasury.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());
const OPEN_STATUSES = ["ABIERTO", "EN_PRODUCCION", "LISTO"] as const;

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.customerOrder.findUnique({ where: { id: orderId }, include: { items: { orderBy: { sortOrder: "asc" } }, client: true } });
  if (!order) throw new SaleError("Pedido inexistente");
  return order;
}

/** Total señado (cobros ligados al pedido). */
export async function depositedAmount(tx: Pick<Tx, "payment">, orderId: string) {
  const agg = await tx.payment.aggregate({ where: { customerOrderId: orderId }, _sum: { amount: true } });
  return agg._sum.amount?.toNumber() ?? 0;
}

/** Caja diaria con turno abierto (las señas y entregas se cobran en mostrador). */
async function drawer(tx: Tx, registerId: string) {
  const register = await lockRegister(tx, registerId);
  if (register.kind !== "CAJA_DIARIA" || !register.branchId) throw new SaleError("Elegí la caja diaria de un local");
  const session = await openSessionOf(tx, register.id);
  if (!session) throw new SaleError(`"${register.name}" no tiene un turno abierto`);
  return { register, session };
}

export async function createCustomerOrder(tx: Tx, input: CreateOrderInput, user: { id: string; canDiscount: boolean }) {
  const client = await tx.client.findUnique({ where: { id: input.clientId } });
  if (!client || !client.active) throw new SaleError("Cliente inexistente o inactivo");
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || !branch.active) throw new SaleError("Local inexistente");
  const list = client.priceListId ? await priceListRule(tx, client.priceListId).catch(() => null) : null;

  const variantIds = input.items.flatMap((i) => (i.variantId ? [i.variantId] : []));
  const variants = new Map((await tx.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: true } })).map((v) => [v.id, v]));
  let specialPrice = false;
  const lines = input.items.map((i, idx) => {
    if (i.variantId) {
      const v = variants.get(i.variantId);
      if (!v || !v.active || !v.product.active) throw new SaleError(`Línea ${idx + 1}: artículo inexistente o inactivo`);
      const listed = listFinalPrice(v.product.listPrice.toNumber(), v.product.vatRate.toNumber(), v.priceAdjustmentPct.toNumber(), v.productId, list);
      if (i.unitPrice < listed - 0.005 || i.discountPct > 0) specialPrice = true;
      return { ...i, productId: v.productId, description: variantLabel(v.product.name, v), vatRate: v.product.vatRate.toNumber() };
    }
    specialPrice = true; // ítem libre: precio a mano
    return { ...i, productId: null, variantId: null, vatRate: 21 };
  });
  if (specialPrice && !user.canDiscount) throw new SaleError("Precios especiales, descuentos e ítems libres los carga un usuario con permiso de descuento");
  if (lines.some((l) => l.discountPct > 0) && (!input.discountReason || input.discountReason.length < 3)) throw new SaleError("Indicá el motivo del descuento");

  const totals = computeSaleTotals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })));
  if (totals.total <= 0) throw new SaleError("El pedido no tiene importe");

  const order = await tx.customerOrder.create({
    data: {
      clientId: client.id,
      quoteId: input.quoteId,
      branchId: branch.id,
      priceListId: list?.id ?? null,
      promisedDate: input.promisedDate ? new Date(`${input.promisedDate}T12:00:00-03:00`) : null,
      notes: [input.notes, input.discountReason ? `Descuento: ${input.discountReason}` : null].filter(Boolean).join(" · ") || null,
      subtotal: D(totals.subtotal),
      taxTotal: D(totals.taxTotal),
      total: D(totals.total),
      createdById: user.id,
      items: {
        create: lines.map((l, i) => ({
          productId: l.productId,
          variantId: l.variantId,
          description: l.description,
          quantity: D(l.quantity),
          unitPrice: D(l.unitPrice),
          discountPct: D(l.discountPct),
          vatRate: D(l.vatRate),
          subtotal: D(totals.lines[i].total),
          sortOrder: i,
        })),
      },
    },
    select: { id: true, number: true },
  });
  if (input.quoteId) await tx.quote.updateMany({ where: { id: input.quoteId, status: { notIn: ["ACEPTADO"] } }, data: { status: "ACEPTADO", closedAt: new Date() } });
  await tx.auditLog.create({ data: { userId: user.id, entity: "CustomerOrder", entityId: order.id, action: "CREATE", data: { number: order.number, total: totals.total, client: client.businessName } } });

  let deposit = 0;
  if (input.deposit) deposit = (await addOrderDeposit(tx, { orderId: order.id, ...input.deposit }, user)).amount;
  return { ...order, total: totals.total, deposit };
}

export async function addOrderDeposit(tx: Tx, input: DepositInput, user: { id: string }) {
  const order = await lockOrder(tx, input.orderId);
  if (!OPEN_STATUSES.includes(order.status as (typeof OPEN_STATUSES)[number])) throw new SaleError("El pedido ya está entregado o cancelado");
  const { register } = await drawer(tx, input.registerId);
  const amount = input.payments.reduce((a, p) => a.plus(p.amount), new Decimal(0));
  const previous = await depositedAmount(tx, order.id);
  const max = new Decimal(order.total.toString()).minus(previous);
  if (amount.gt(max.plus(0.005))) throw new SaleError(`La seña supera el saldo del pedido (${formatMoney(max.toNumber())})`);
  await registerCollections(tx, input.payments, {
    drawerId: register.id,
    clientId: order.clientId,
    userId: user.id,
    concept: `Seña pedido #${order.number} — ${order.client.businessName}`,
    link: { customerOrderId: order.id },
  });
  await tx.auditLog.create({ data: { userId: user.id, entity: "CustomerOrder", entityId: order.id, action: "DEPOSIT", data: { amount: amount.toNumber() } } });
  return { number: order.number, amount: amount.toNumber(), deposited: previous + amount.toNumber(), balance: max.minus(amount).toNumber() };
}

/** Órdenes de producción para el cliente con los talles del pedido (una por producto). */
export async function createOrderProduction(tx: Tx, orderId: string, input: { requiresPersonalization: boolean }, userId: string) {
  const order = await lockOrder(tx, orderId);
  if (order.status !== "ABIERTO" && order.status !== "EN_PRODUCCION") throw new SaleError("Solo se produce un pedido abierto");
  const existing = await tx.productionOrder.count({ where: { customerOrderId: order.id, status: { not: "CANCELADA" } } });
  if (existing > 0) throw new SaleError("El pedido ya tiene órdenes de producción");
  const byProduct = new Map<string, Map<string, number>>();
  for (const it of order.items) {
    if (!it.variantId || !it.productId) continue;
    const q = it.quantity.toNumber();
    if (!Number.isInteger(q)) throw new SaleError(`${it.description}: la cantidad a producir tiene que ser entera`);
    const sizes = byProduct.get(it.productId) ?? new Map<string, number>();
    sizes.set(it.variantId, (sizes.get(it.variantId) ?? 0) + q);
    byProduct.set(it.productId, sizes);
  }
  if (byProduct.size === 0) throw new SaleError("El pedido no tiene prendas del catálogo para producir");
  const created: number[] = [];
  for (const [productId, sizes] of byProduct) {
    const op = await createProductionOrder(
      tx,
      {
        productId,
        clientId: order.clientId,
        dueDate: order.promisedDate?.toISOString() ?? null,
        notes: `Pedido #${order.number} — ${order.client.businessName}`,
        requiresPersonalization: input.requiresPersonalization,
        items: [...sizes].map(([variantId, quantity]) => ({ variantId, quantity })),
      },
      userId,
    );
    await tx.productionOrder.update({ where: { id: op.id }, data: { customerOrderId: order.id } });
    created.push(op.number);
  }
  await tx.customerOrder.update({ where: { id: order.id }, data: { status: "EN_PRODUCCION" } });
  return created;
}

export async function setOrderStatus(tx: Tx, orderId: string, status: "ABIERTO" | "EN_PRODUCCION" | "LISTO", userId: string) {
  const order = await lockOrder(tx, orderId);
  if (!OPEN_STATUSES.includes(order.status as (typeof OPEN_STATUSES)[number])) throw new SaleError("El pedido ya está entregado o cancelado");
  await tx.customerOrder.update({ where: { id: order.id }, data: { status } });
  await tx.auditLog.create({ data: { userId, entity: "CustomerOrder", entityId: order.id, action: "STATUS", data: { from: order.status, to: status } } });
}

/** Entrega: genera la venta con los precios del pedido, aplica la seña y cobra el saldo. */
export async function deliverCustomerOrder(tx: Tx, input: DeliverInput, user: { id: string }) {
  const order = await lockOrder(tx, input.orderId);
  if (!OPEN_STATUSES.includes(order.status as (typeof OPEN_STATUSES)[number])) throw new SaleError("El pedido ya está entregado o cancelado");
  const { register, session } = await drawer(tx, input.registerId);
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: register.branchId! } });
  const stockBranch = await tx.branch.findUnique({ where: { id: input.stockBranchId } });
  if (!stockBranch || !stockBranch.active) throw new SaleError("Local de stock inexistente");
  const client = order.client;
  if (input.invoiceType === "FACTURA_A" && (client.taxCondition !== "RESPONSABLE_INSCRIPTO" || client.documentType !== "CUIT" || !client.documentNumber)) {
    throw new SaleError("La factura A requiere un cliente responsable inscripto con CUIT");
  }

  const deposited = new Decimal(await depositedAmount(tx, order.id));
  const total = new Decimal(order.total.toString());
  const remaining = total.minus(deposited);
  if (remaining.lt(-0.005)) throw new SaleError("Lo señado supera el total del pedido: revisá las señas");
  const payments: CollectionPayment[] = input.payments.filter((p) => p.amount > 0);
  let plan = { change: 0, cashKept: 0, onAccount: 0 };
  if (remaining.gt(0.005)) {
    plan = planPayments(remaining.toDecimalPlaces(2).toNumber(), payments);
    if (plan.onAccount > 0) {
      const balance = await clientOpenBalance(tx, client.id);
      if (balance + plan.onAccount > client.creditLimit.toNumber()) {
        throw new SaleError(`Supera el límite de crédito de ${client.businessName}: debe ${formatMoney(balance)}, límite ${formatMoney(client.creditLimit.toNumber())}`);
      }
    }
  } else if (payments.length > 0) {
    throw new SaleError("El pedido ya está pagado con la seña: no cargues otros cobros");
  }

  // Totales recalculados con las líneas guardadas (mismo resultado que al tomar el pedido).
  const totals = computeSaleTotals(order.items.map((i) => ({ quantity: i.quantity.toNumber(), unitPrice: i.unitPrice.toNumber(), discountPct: i.discountPct.toNumber(), vatRate: i.vatRate.toNumber() })));
  const products = new Map(
    (await tx.product.findMany({ where: { id: { in: order.items.flatMap((i) => (i.productId ? [i.productId] : [])) } }, select: { id: true, currentCost: true } })).map((p) => [p.id, p.currentCost]),
  );
  const pointOfSale = branch.pointOfSale ?? 1;
  const fiscal = isFiscal(input.invoiceType as InvoiceType);
  const invoiceNumber = fiscal ? null : await nextInternalNumber(tx, branch.id, pointOfSale);
  const sale = await tx.sale.create({
    data: {
      channel: "MOSTRADOR",
      status: "ENTREGADA",
      clientId: client.id,
      userId: user.id,
      cashSessionId: session.id,
      branchId: branch.id,
      priceListId: order.priceListId,
      invoiceType: input.invoiceType,
      pointOfSale,
      invoiceNumber,
      arcaStatus: fiscal ? "PENDIENTE" : "NO_APLICA",
      subtotal: D(totals.subtotal),
      discountTotal: D(totals.discountTotal),
      discountReason: totals.discountTotal > 0 ? `Pedido #${order.number}` : null,
      taxTotal: D(totals.taxTotal),
      total: D(totals.total),
      changeAmount: D(plan.change),
      notes: `Entrega del pedido #${order.number}`,
      items: {
        create: order.items.map((i, idx) => ({
          productId: i.productId,
          variantId: i.variantId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPct: i.discountPct,
          vatRate: i.vatRate,
          subtotal: D(totals.lines[idx].total),
          unitCost: (i.productId && products.get(i.productId)) || D(0),
        })),
      },
    },
    select: { id: true, number: true },
  });

  const warnings: string[] = [];
  for (const i of order.items) {
    if (!i.variantId) continue;
    const r = await adjustBranchStock(tx, i.variantId, stockBranch.id, i.quantity.neg(), { reason: "PEDIDO", refType: "VENTA", refId: sale.id, userId: user.id, notes: `Pedido #${order.number}` });
    if (r.branch.lt(0)) warnings.push(`${i.description}: stock negativo en ${stockBranch.name} (${formatNumber(r.branch.toNumber())})`);
  }

  if (deposited.gt(0)) {
    await tx.payment.create({ data: { method: "SENA", amount: D(Decimal.min(deposited, total)), reference: `Pedido #${order.number}`, saleId: sale.id, createdById: user.id } });
  }
  if (payments.length > 0) {
    await registerCollections(tx, payments, { drawerId: register.id, clientId: client.id, userId: user.id, concept: `Venta #${sale.number} (pedido #${order.number})`, link: { saleId: sale.id }, cashKept: plan.cashKept });
  }
  if (plan.onAccount > 0) {
    await tx.accountReceivable.create({
      data: {
        clientId: client.id,
        saleId: sale.id,
        description: `Venta #${sale.number} (pedido #${order.number}) en cuenta corriente`,
        dueDate: addDays(new Date(), client.paymentTermDays),
        amount: D(plan.onAccount),
        balance: D(plan.onAccount),
      },
    });
  }
  await tx.customerOrder.update({ where: { id: order.id }, data: { status: "ENTREGADO", saleId: sale.id, deliveredAt: new Date() } });
  await tx.productionOrder.updateMany({ where: { customerOrderId: order.id, saleId: null }, data: { saleId: sale.id } });
  await tx.auditLog.create({ data: { userId: user.id, entity: "CustomerOrder", entityId: order.id, action: "DELIVER", data: { sale: sale.number, deposited: deposited.toNumber(), stockBranch: stockBranch.name } } });
  return { ...sale, total: totals.total, deposited: deposited.toNumber(), change: plan.change, fiscal, warnings, variantIds: order.items.flatMap((i) => (i.variantId ? [i.variantId] : [])) };
}

export async function cancelCustomerOrder(tx: Tx, input: CancelOrderInput, user: { id: string }) {
  const order = await lockOrder(tx, input.orderId);
  if (!OPEN_STATUSES.includes(order.status as (typeof OPEN_STATUSES)[number])) throw new SaleError("El pedido ya está entregado o cancelado");
  const deposited = await depositedAmount(tx, order.id);
  const concept = `Cancelación pedido #${order.number} — ${order.client.businessName}`;
  let result = "sin seña";
  if (deposited > 0) {
    if (input.refund === "VALE") {
      const credit = await issueStoreCredit(tx, { amount: deposited, clientId: order.clientId, originSaleId: null, userId: user.id, notes: `Seña del pedido #${order.number}` });
      result = `seña convertida en el vale ${credit.code}`;
    } else if (input.refund === "RETENER") {
      result = `seña de ${formatMoney(deposited)} retenida`;
    } else {
      const target =
        input.refund === "EFECTIVO"
          ? input.registerId
            ? await lockRegister(tx, input.registerId)
            : null
          : await tx.cashRegister.findFirst({ where: { active: true, defaultForMethods: { has: input.refund } } });
      if (!target) throw new SaleError(input.refund === "EFECTIVO" ? "Elegí la caja de la que sale el efectivo" : `No hay una cuenta configurada para ${METHOD_LABELS[input.refund]}`);
      const register = await lockRegister(tx, target.id);
      await addMovement(tx, { register, type: "EGRESO", method: input.refund, amount: new Decimal(deposited), concept, userId: user.id });
      result = `seña de ${formatMoney(deposited)} devuelta (${METHOD_LABELS[input.refund]})`;
    }
  }
  await tx.customerOrder.update({ where: { id: order.id }, data: { status: "CANCELADO", cancelReason: `${input.reason} · ${result}`.slice(0, 500), cancelledAt: new Date() } });
  await tx.auditLog.create({ data: { userId: user.id, entity: "CustomerOrder", entityId: order.id, action: "CANCEL", reason: input.reason, data: { deposited, refund: input.refund } } });
  const openOps = await tx.productionOrder.count({ where: { customerOrderId: order.id, status: { in: ["BORRADOR", "EN_PROCESO"] } } });
  return { number: order.number, result, openOps };
}
