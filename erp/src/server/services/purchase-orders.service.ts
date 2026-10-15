/**
 * Órdenes de compra y notas de crédito de proveedores.
 *  - La orden registra lo pedido y el precio pactado; al cargar la compra (factura o
 *    remito) contra la orden se suma lo recibido y la orden pasa a parcial / recibida.
 *  - La nota de crédito descuenta la deuda de los comprobantes elegidos; lo que sobra
 *    queda como saldo a favor para usar en una orden de pago. Si hay mercadería
 *    devuelta, sale del stock.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { InvoiceType } from "@/generated/prisma/enums";
import { variantLabel } from "@/lib/catalog/variants";
import { formatMoney, formatNumber } from "@/lib/format";
import { computePurchaseTotals, PurchasingError } from "@/lib/purchasing/math";
import type { CreditNoteInput, PurchaseOrderInput } from "@/lib/validations/purchasing";
import { moveRawMaterial } from "@/server/services/materials.service";
import { adjustBranchStock, mainBranchId } from "@/server/services/stock.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

export async function createPurchaseOrder(tx: Tx, input: PurchaseOrderInput, userId: string) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier || !supplier.active) throw new PurchasingError("Proveedor inexistente o inactivo");
  const materials = new Map(
    (await tx.rawMaterial.findMany({ where: { id: { in: input.items.flatMap((i) => (i.rawMaterialId ? [i.rawMaterialId] : [])) } } })).map((m) => [m.id, m]),
  );
  const variants = new Map(
    (await tx.productVariant.findMany({ where: { id: { in: input.items.flatMap((i) => (i.productVariantId ? [i.productVariantId] : [])) } }, include: { product: true } })).map((v) => [v.id, v]),
  );
  const lines = input.items.map((i, idx) => {
    if (i.kind === "RAW") {
      const m = materials.get(i.rawMaterialId!);
      if (!m || !m.active) throw new PurchasingError(`Línea ${idx + 1}: materia prima inexistente o inactiva`);
      return { ...i, productVariantId: null, description: `${m.code} · ${m.name}` };
    }
    const v = variants.get(i.productVariantId!);
    if (!v || !v.active) throw new PurchasingError(`Línea ${idx + 1}: artículo inexistente o inactivo`);
    if (i.uom !== "UNIDAD") throw new PurchasingError(`Línea ${idx + 1}: el producto terminado se pide por unidad`);
    return { ...i, rawMaterialId: null, description: `${v.sku} · ${variantLabel(v.product.name, v)}` };
  });
  const totals = computePurchaseTotals(lines, { perceptionIva: 0, perceptionIibb: 0, otherTaxes: 0 }, "FACTURA_A");
  return tx.purchaseOrder.create({
    data: {
      supplierId: supplier.id,
      expectedDate: input.expectedDate ? new Date(`${input.expectedDate}T12:00:00-03:00`) : null,
      notes: input.notes,
      subtotal: D(totals.subtotal),
      taxTotal: D(totals.taxTotal),
      total: D(totals.total),
      createdById: userId,
      items: {
        create: lines.map((l, i) => ({
          rawMaterialId: l.rawMaterialId,
          productVariantId: l.productVariantId,
          description: l.description,
          quantity: D(l.quantity),
          uom: l.uom,
          unitCost: D(l.unitCost),
          vatRate: D(l.vatRate),
          sortOrder: i,
        })),
      },
    },
    select: { id: true, number: true, total: true },
  });
}

export async function cancelPurchaseOrder(tx: Tx, input: { orderId: string; reason: string }, userId: string) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${input.orderId} FOR UPDATE`;
  const order = await tx.purchaseOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new PurchasingError("Orden de compra inexistente");
  if (order.status === "RECIBIDA" || order.status === "CANCELADA") throw new PurchasingError("La orden ya está cerrada");
  // Una orden recibida en parte se cierra: lo que no llegó ya no se espera.
  await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: order.status === "PARCIAL" ? "RECIBIDA" : "CANCELADA", cancelReason: input.reason } });
  await tx.auditLog.create({ data: { userId, entity: "PurchaseOrder", entityId: order.id, action: "CANCEL", reason: input.reason, data: { number: order.number } } });
  return order.number;
}

export interface ReceptionAlert {
  description: string;
  ordered: number;
  received: number;
  orderedCost: number;
  invoicedCost: number;
}

/**
 * Recepción contra una orden: suma lo recibido a cada línea, avisa diferencias de
 * precio o cantidad y actualiza el estado de la orden. Se llama al registrar la compra.
 */
export async function receiveAgainstOrder(
  tx: Tx,
  purchaseOrderId: string,
  supplierId: string,
  lines: { purchaseOrderItemId: string | null; rawMaterialId: string | null; productVariantId: string | null; quantity: number; uom: string; unitCost: number }[],
) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${purchaseOrderId} FOR UPDATE`;
  const order = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { items: true } });
  if (!order || order.supplierId !== supplierId) throw new PurchasingError("La orden de compra no es de este proveedor");
  if (order.status === "RECIBIDA" || order.status === "CANCELADA") throw new PurchasingError(`La orden de compra #${order.number} ya está cerrada`);
  const alerts: ReceptionAlert[] = [];
  for (const l of lines) {
    if (!l.purchaseOrderItemId) continue;
    const item = order.items.find((i) => i.id === l.purchaseOrderItemId);
    if (!item) throw new PurchasingError("Hay líneas que no son de la orden de compra");
    if ((item.rawMaterialId ?? null) !== l.rawMaterialId || (item.productVariantId ?? null) !== l.productVariantId) {
      throw new PurchasingError(`${item.description}: el artículo no coincide con la orden`);
    }
    if (item.uom !== l.uom) throw new PurchasingError(`${item.description}: recibilo en la misma unidad que la orden (${item.uom.toLowerCase()})`);
    const received = new Decimal(item.receivedQty.toString()).plus(l.quantity);
    await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: D(received) } });
    item.receivedQty = D(received);
    const priceDiff = Math.abs(item.unitCost.toNumber() - l.unitCost) > 0.005;
    if (priceDiff || received.gt(item.quantity)) {
      alerts.push({ description: item.description, ordered: item.quantity.toNumber(), received: received.toNumber(), orderedCost: item.unitCost.toNumber(), invoicedCost: l.unitCost });
    }
  }
  const complete = order.items.every((i) => i.receivedQty.gte(i.quantity));
  await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "RECIBIDA" : "PARCIAL" } });
  return { number: order.number, complete, alerts };
}

export function receptionAlertText(a: ReceptionAlert) {
  const parts = [];
  if (Math.abs(a.orderedCost - a.invoicedCost) > 0.005) parts.push(`precio pactado ${formatMoney(a.orderedCost)}, facturado ${formatMoney(a.invoicedCost)}`);
  if (a.received > a.ordered) parts.push(`se pidieron ${formatNumber(a.ordered)} y llegaron ${formatNumber(a.received)}`);
  return `${a.description}: ${parts.join("; ")}`;
}

/** Nota de crédito de proveedor: devuelve mercadería (opcional), baja la deuda y deja el sobrante como saldo a favor. */
export async function createSupplierCreditNote(tx: Tx, input: CreditNoteInput, userId: string) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new PurchasingError("Proveedor inexistente");
  if (input.invoiceType !== "TICKET_INTERNO" && input.invoiceNumber) {
    const dup = await tx.purchase.findFirst({
      where: { supplierId: supplier.id, invoiceType: input.invoiceType as InvoiceType, pointOfSale: input.pointOfSale, invoiceNumber: input.invoiceNumber, status: { not: "ANULADA" } },
      select: { number: true },
    });
    if (dup) throw new PurchasingError(`Esa nota de crédito ya está cargada (#${dup.number})`);
  }
  const materials = new Map(
    (await tx.rawMaterial.findMany({ where: { id: { in: input.returns.flatMap((i) => (i.rawMaterialId ? [i.rawMaterialId] : [])) } } })).map((m) => [m.id, m]),
  );
  const variants = new Map(
    (await tx.productVariant.findMany({ where: { id: { in: input.returns.flatMap((i) => (i.productVariantId ? [i.productVariantId] : [])) } }, include: { product: true } })).map((v) => [v.id, v]),
  );
  const returns = input.returns.map((r, idx) => {
    if (r.kind === "RAW") {
      const m = materials.get(r.rawMaterialId ?? "");
      if (!m) throw new PurchasingError(`Devolución ${idx + 1}: elegí la materia prima`);
      return { ...r, description: `Devolución ${m.code} · ${m.name}`, material: m, variant: null };
    }
    const v = variants.get(r.productVariantId ?? "");
    if (!v) throw new PurchasingError(`Devolución ${idx + 1}: elegí el artículo`);
    return { ...r, description: `Devolución ${v.sku} · ${variantLabel(v.product.name, v)}`, material: null, variant: v };
  });
  const lines = [
    ...returns.map((r) => ({ quantity: r.quantity, unitCost: r.unitCost, vatRate: r.vatRate })),
    ...input.concepts.map((c) => ({ quantity: 1, unitCost: c.amount, vatRate: c.vatRate })),
  ];
  const totals = computePurchaseTotals(lines, { perceptionIva: 0, perceptionIibb: 0, otherTaxes: 0 }, input.invoiceType);
  if (totals.total <= 0) throw new PurchasingError("La nota de crédito no tiene importe");
  const date = new Date(input.date);

  const nc = await tx.purchase.create({
    data: {
      kind: "NOTA_CREDITO",
      supplierId: supplier.id,
      invoiceType: input.invoiceType,
      pointOfSale: input.pointOfSale,
      invoiceNumber: input.invoiceNumber,
      status: "RECIBIDA",
      date,
      subtotal: D(totals.subtotal),
      taxTotal: D(totals.taxTotal),
      vat21: D(totals.vat21),
      vat105: D(totals.vat105),
      vat27: D(totals.vat27),
      total: D(totals.total),
      notes: input.notes,
      createdById: userId,
      items: {
        create: [
          ...returns.map((r, i) => ({
            itemType: r.material ? (r.material.type === "TELA" ? ("MATERIA_PRIMA" as const) : ("AVIO_INSUMO" as const)) : ("PRODUCTO_TERMINADO" as const),
            description: r.description,
            rawMaterialId: r.material?.id ?? null,
            productVariantId: r.variant?.id ?? null,
            quantity: D(r.quantity),
            uom: r.material?.uom ?? ("UNIDAD" as const),
            unitCost: D(r.unitCost),
            vatRate: D(r.vatRate),
            subtotal: D(totals.lines[i].subtotal),
          })),
          ...input.concepts.map((c, j) => ({
            itemType: "OTRO" as const,
            description: c.description,
            quantity: D(1),
            uom: "UNIDAD" as const,
            unitCost: D(c.amount),
            vatRate: D(c.vatRate),
            subtotal: D(totals.lines[returns.length + j].subtotal),
          })),
        ],
      },
    },
    select: { id: true, number: true },
  });

  // Mercadería devuelta: sale del stock (la materia prima en su unidad de stock; el producto, del local principal).
  for (const r of returns) {
    if (r.material) {
      await moveRawMaterial(tx, { rawMaterialId: r.material.id, delta: D(-r.quantity), reason: "DEVOLUCION_PROVEEDOR", refType: "COMPRA", refId: nc.id, unitCost: r.unitCost, userId, notes: `NC proveedor #${nc.number}` });
    } else if (r.variant) {
      await adjustBranchStock(tx, r.variant.id, await mainBranchId(tx), -r.quantity, { reason: "ANULACION_COMPRA", refType: "COMPRA", refId: nc.id, userId, notes: `Devolución a proveedor (NC #${nc.number})` });
    }
  }

  // Imputación a los comprobantes elegidos; el resto queda como saldo a favor.
  let left = new Decimal(totals.total);
  if (input.payableIds.length) {
    await tx.$queryRaw`SELECT id FROM accounts_payable WHERE id IN (${Prisma.join(input.payableIds)}) FOR UPDATE`;
    const payables = await tx.accountPayable.findMany({ where: { id: { in: input.payableIds } }, orderBy: { dueDate: "asc" } });
    for (const p of payables) {
      if (p.supplierId !== supplier.id) throw new PurchasingError("Hay comprobantes de otro proveedor");
      if (p.status !== "PENDIENTE" && p.status !== "PARCIAL") continue;
      if (left.lte(0)) break;
      const take = Decimal.min(left, p.balance.toString());
      const balance = new Decimal(p.balance.toString()).minus(take);
      await tx.accountPayable.update({ where: { id: p.id }, data: { balance: D(balance), status: balance.lte(0) ? "CANCELADO" : "PARCIAL" } });
      await tx.payment.create({ data: { method: "SALDO_A_FAVOR", amount: D(take), reference: `NC #${nc.number}`, accountPayableId: p.id, createdById: userId } });
      left = left.minus(take);
    }
  }
  let credit: { number: number } | null = null;
  if (left.gt(0.004)) {
    credit = await tx.creditorCredit.create({
      data: { supplierId: supplier.id, origin: "NOTA_CREDITO", amount: D(left), balance: D(left), purchaseId: nc.id, notes: `Nota de crédito #${nc.number}` },
      select: { number: true },
    });
  }
  await tx.auditLog.create({ data: { userId, entity: "Purchase", entityId: nc.id, action: "CREDIT_NOTE", data: { number: nc.number, total: totals.total, credit: left.toNumber() } } });
  return {
    ...nc,
    total: totals.total,
    message: `Nota de crédito #${nc.number} por ${formatMoney(totals.total)} registrada${credit ? ` · ${formatMoney(left.toNumber())} quedan como saldo a favor (#${credit.number})` : ""}`,
  };
}
