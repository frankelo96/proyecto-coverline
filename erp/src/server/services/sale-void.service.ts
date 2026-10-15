/**
 * Anulación de ventas sin CAE y cambio de talle al mismo precio.
 *  - Una factura autorizada por ARCA no se anula: se hace nota de crédito (devolución).
 *  - Anular revierte todo: stock, cobros (contraasiento en cada caja/cuenta),
 *    cheques en cartera, vales usados y deuda en cuenta corriente.
 *  - El cambio de talle (misma prenda, mismo precio) no genera comprobantes:
 *    entra el talle devuelto, sale el nuevo y la línea de la venta queda con el talle nuevo.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import { isFiscal } from "@/lib/arca/codes";
import { variantLabel } from "@/lib/catalog/variants";
import { formatNumber } from "@/lib/format";
import { SaleError } from "@/lib/pos/sale-math";
import { returnedQuantities } from "@/server/services/returns.service";
import { adjustBranchStock } from "@/server/services/stock.service";
import { restoreStoreCredit } from "@/server/services/store-credit.service";
import { addMovement, lockRegister } from "@/server/services/treasury.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

/** Si la venta se puede anular y, si no, por qué (para mostrarlo en pantalla). */
export function voidBlocker(s: {
  kind: string;
  status: string;
  channel: string;
  invoiceType: Parameters<typeof isFiscal>[0];
  arcaStatus: string;
  arcaRequestedNumber: number | null;
  activeReturns: number;
}): string | null {
  if (s.kind !== "VENTA") return "Solo se anulan ventas";
  if (s.status === "ANULADA") return "La venta ya está anulada";
  if (s.channel === "WEB") return "Las ventas web se cancelan desde la tienda";
  if (s.activeReturns > 0) return "La venta tiene devoluciones: no se puede anular";
  if (isFiscal(s.invoiceType)) {
    if (s.arcaStatus === "AUTORIZADO") return "La factura tiene CAE: para revertirla hacé una devolución (nota de crédito)";
    // Si se pidió número a ARCA y no hubo respuesta clara, la factura podría existir: primero reintentar.
    if (s.arcaStatus === "PENDIENTE" && s.arcaRequestedNumber !== null) return "Hay un pedido de CAE sin respuesta: reintentá la autorización antes de anular";
  }
  return null;
}

export async function voidSale(tx: Tx, input: { saleId: string; reason: string }, user: { id: string }) {
  await tx.$queryRaw`SELECT id FROM sales WHERE id = ${input.saleId} FOR UPDATE`;
  const sale = await tx.sale.findUnique({
    where: { id: input.saleId },
    include: {
      items: true,
      payments: { include: { cheque: true } },
      receivables: true,
      cashMovements: { where: { type: "INGRESO" } },
      _count: { select: { returns: { where: { status: { not: "ANULADA" } } } } },
    },
  });
  if (!sale) throw new SaleError("Venta inexistente");
  const blocker = voidBlocker({ ...sale, activeReturns: sale._count.returns });
  if (blocker) throw new SaleError(blocker);
  const concept = `Anulación venta #${sale.number}`;

  // --- Stock: vuelve al local de la venta
  for (const it of sale.items) {
    if (!it.variantId || !sale.branchId) continue;
    await adjustBranchStock(tx, it.variantId, sale.branchId, it.quantity, { reason: "ANULACION_VENTA", refType: "VENTA", refId: sale.id, userId: user.id, notes: `${concept}: ${input.reason}` });
  }

  // --- Dinero que entró a cajas y cuentas (efectivo, banco, Mercado Pago, tarjetas): contraasiento
  for (const m of sale.cashMovements) {
    const register = await lockRegister(tx, m.cashRegisterId);
    await addMovement(tx, { register, type: "EGRESO", method: m.method, amount: new Decimal(m.amount.toString()), concept, userId: user.id, saleId: sale.id });
  }

  for (const p of sale.payments) {
    // Cheque recibido: si sigue en cartera se anula (se le devuelve al cliente)
    if (p.cheque) {
      if (p.cheque.status !== "EN_CARTERA") throw new SaleError(`El cheque ${p.cheque.bank} N° ${p.cheque.number} ya no está en cartera: hacé una devolución`);
      await tx.cheque.update({ where: { id: p.cheque.id }, data: { status: "ANULADO", rejectedAt: new Date(), rejectionReason: concept } });
    }
    // Vale usado: recupera el saldo
    if (p.method === "VALE" && p.storeCreditId) await restoreStoreCredit(tx, p.storeCreditId, p.amount.toNumber());
  }

  // --- Deuda en cuenta corriente: se anula si no tiene cobros aplicados
  for (const r of sale.receivables) {
    if (r.status === "ANULADO") continue;
    if (r.balance.lt(r.amount)) throw new SaleError("La deuda de esta venta ya tiene cobros aplicados: hacé una devolución con crédito en cuenta corriente");
    await tx.accountReceivable.update({ where: { id: r.id }, data: { status: "ANULADO", balance: D(0) } });
  }

  await tx.sale.update({
    where: { id: sale.id },
    data: {
      status: "ANULADA",
      // Una factura que nunca obtuvo CAE deja de estar pendiente de autorización.
      ...(isFiscal(sale.invoiceType) ? { arcaStatus: "NO_APLICA", arcaError: `Anulada antes de autorizar: ${input.reason}`.slice(0, 300) } : {}),
      notes: [sale.notes, `ANULADA: ${input.reason}`].filter(Boolean).join(" · ").slice(0, 500),
    },
  });
  await tx.auditLog.create({
    data: { userId: user.id, entity: "Sale", entityId: sale.id, action: "VOID", reason: input.reason, data: { number: sale.number, total: sale.total.toNumber(), invoiceType: sale.invoiceType } },
  });
  return { number: sale.number, variantIds: sale.items.flatMap((i) => (i.variantId ? [i.variantId] : [])) };
}

/**
 * Cambio de talle (u otro color/tela) de la misma prenda con el mismo precio:
 * entra lo devuelto y sale lo nuevo en el local donde se hace el cambio. Si
 * el precio es distinto, corresponde devolución con vale y venta nueva.
 */
export async function exchangeSaleItem(tx: Tx, input: { saleId: string; itemId: string; newVariantId: string; quantity: number; branchId: string }, user: { id: string }) {
  await tx.$queryRaw`SELECT id FROM sales WHERE id = ${input.saleId} FOR UPDATE`;
  const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { items: { include: { variant: true } } } });
  if (!sale || sale.kind !== "VENTA" || sale.status === "ANULADA") throw new SaleError("Venta inexistente o anulada");
  const item = sale.items.find((i) => i.id === input.itemId);
  if (!item?.variant) throw new SaleError("Elegí una prenda del catálogo de esta venta");
  const next = await tx.productVariant.findUnique({ where: { id: input.newVariantId }, include: { product: true } });
  if (!next || !next.active) throw new SaleError("Talle inexistente o inactivo");
  if (next.id === item.variant.id) throw new SaleError("Elegí un talle distinto");
  if (next.productId !== item.variant.productId) throw new SaleError("El cambio directo es por la misma prenda: para otra prenda hacé una devolución con vale");
  if (!next.priceAdjustmentPct.equals(item.variant.priceAdjustmentPct)) {
    throw new SaleError("Ese talle tiene otro precio: hacé una devolución con vale y una venta nueva");
  }
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || !branch.active) throw new SaleError("Local inexistente");

  const returned = (await returnedQuantities(tx, sale.id)).get(item.id)?.quantity ?? 0;
  const sold = item.quantity.toNumber();
  const available = sold - returned;
  if (!(input.quantity > 0) || input.quantity > available + 1e-9) throw new SaleError(`Se pueden cambiar hasta ${formatNumber(available)} unidades`);

  const description = variantLabel(next.product.name, next);
  if (Math.abs(input.quantity - sold) < 1e-9) {
    await tx.saleItem.update({ where: { id: item.id }, data: { variantId: next.id, description } });
  } else {
    // Cambio parcial: la línea se divide (mismo precio unitario y descuento).
    const part = new Decimal(item.subtotal.toString()).mul(input.quantity).div(sold).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    await tx.saleItem.update({ where: { id: item.id }, data: { quantity: D(new Decimal(sold).minus(input.quantity)), subtotal: D(new Decimal(item.subtotal.toString()).minus(part)) } });
    await tx.saleItem.create({
      data: {
        saleId: sale.id,
        productId: item.productId,
        variantId: next.id,
        description,
        quantity: D(input.quantity),
        unitPrice: item.unitPrice,
        discountPct: item.discountPct,
        discountReason: item.discountReason,
        vatRate: item.vatRate,
        subtotal: D(part),
        unitCost: item.unitCost,
      },
    });
  }

  const notes = `Cambio venta #${sale.number}: ${item.description} → ${description}`;
  await adjustBranchStock(tx, item.variant.id, branch.id, input.quantity, { reason: "CAMBIO", refType: "VENTA", refId: sale.id, userId: user.id, notes });
  const out = await adjustBranchStock(tx, next.id, branch.id, -input.quantity, { reason: "CAMBIO", refType: "VENTA", refId: sale.id, userId: user.id, notes });
  await tx.auditLog.create({
    data: { userId: user.id, entity: "Sale", entityId: sale.id, action: "EXCHANGE", reason: notes, data: { from: item.variant.sku, to: next.sku, quantity: input.quantity, branch: branch.name } },
  });
  return {
    message: `${notes} (${formatNumber(input.quantity)} u.)`,
    warning: out.branch.lt(0) ? `${description}: stock negativo en ${branch.name} (${out.branch.toNumber()})` : null,
    variantIds: [item.variant.id, next.id],
  };
}
