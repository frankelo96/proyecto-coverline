/**
 * Devoluciones de mercadería.
 *  - Factura A/B con CAE → nota de crédito A/B (se pide CAE asociando la factura).
 *  - Ticket interno → devolución interna.
 *  - Importe por línea proporcional a lo cobrado (respeta los descuentos de la venta).
 *  - Reintegro: efectivo del cajón del turno, transferencia/Mercado Pago desde su
 *    cuenta, o crédito contra la deuda en cuenta corriente de esa venta.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { InvoiceType } from "@/generated/prisma/enums";
import { CREDIT_NOTE_FOR, isFiscal } from "@/lib/arca/codes";
import { formatMoney, formatNumber } from "@/lib/format";
import { computeSaleTotals, SaleError } from "@/lib/pos/sale-math";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import type { ReturnInput } from "@/lib/validations/returns";
import { nextInternalNumber } from "@/server/services/pos.service";
import { addMovement, lockRegister, openSessionOf } from "@/server/services/treasury.service";
import { adjustBranchStock } from "@/server/services/stock.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

/** Cantidades ya devueltas por ítem de la venta original. */
export async function returnedQuantities(db: Tx | Prisma.DefaultPrismaClient, originalSaleId: string) {
  const rows = await (db as Tx).saleItem.groupBy({
    by: ["originalItemId"],
    where: { sale: { originalSaleId, kind: "DEVOLUCION", status: { not: "ANULADA" } }, originalItemId: { not: null } },
    _sum: { quantity: true, subtotal: true },
  });
  return new Map(rows.map((r) => [r.originalItemId!, { quantity: r._sum.quantity?.toNumber() ?? 0, amount: r._sum.subtotal?.toNumber() ?? 0 }]));
}

export async function createReturn(tx: Tx, input: ReturnInput, user: { id: string }) {
  await tx.$queryRaw`SELECT id FROM sales WHERE id = ${input.originalSaleId} FOR UPDATE`;
  const original = await tx.sale.findUnique({
    where: { id: input.originalSaleId },
    include: { items: true, receivables: { where: { status: { in: ["PENDIENTE", "PARCIAL"] } } } },
  });
  if (!original || original.kind !== "VENTA" || original.status === "ANULADA") throw new SaleError("Venta inexistente o anulada");
  const fiscal = isFiscal(original.invoiceType);
  if (fiscal && original.arcaStatus !== "AUTORIZADO") {
    throw new SaleError("La factura todavía no tiene CAE: autorizala antes de emitir la nota de crédito");
  }

  const register = await lockRegister(tx, input.registerId);
  if (register.kind !== "CAJA_DIARIA" || !register.branchId) throw new SaleError("Las devoluciones se registran en la caja diaria de un local");
  const session = await openSessionOf(tx, register.id);
  if (!session) throw new SaleError(`"${register.name}" no tiene un turno abierto`);
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: register.branchId } });

  // --- Líneas a devolver, con tope en lo vendido menos lo ya devuelto
  const already = await returnedQuantities(tx, original.id);
  const lines = input.items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const item = original.items.find((x) => x.id === i.originalItemId);
      if (!item) throw new SaleError("Hay ítems que no son de esta venta");
      const sold = item.quantity.toNumber();
      const prev = already.get(item.id) ?? { quantity: 0, amount: 0 };
      const available = sold - prev.quantity;
      if (i.quantity > available + 1e-9) throw new SaleError(`${item.description}: se pueden devolver hasta ${formatNumber(available)}`);
      // Importe proporcional a lo cobrado (incluye descuentos). Si se devuelve todo lo que queda,
      // se toma exactamente el saldo de la línea para no exceder lo cobrado por redondeo.
      const paid = new Decimal(item.subtotal.toString());
      const lineTotal =
        Math.abs(i.quantity - available) < 1e-9
          ? paid.minus(prev.amount)
          : paid.mul(i.quantity).div(sold).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      return { item, quantity: i.quantity, restock: i.restock && item.variantId !== null, lineTotal: lineTotal.toNumber() };
    });
  // Cada línea entra con su total final (cantidad 1 a efectos del cálculo) para conservar el desglose de IVA.
  const totals = computeSaleTotals(lines.map((l) => ({ quantity: 1, unitPrice: l.lineTotal, discountPct: 0, vatRate: l.item.vatRate.toNumber() })));
  const totalReturned = totals.total;

  const invoiceType = (CREDIT_NOTE_FOR[original.invoiceType] ?? "TICKET_INTERNO") as InvoiceType;
  const pointOfSale = original.pointOfSale ?? branch.pointOfSale ?? 1;
  const invoiceNumber = isFiscal(invoiceType) ? null : await nextInternalNumber(tx, branch.id, pointOfSale);

  const nc = await tx.sale.create({
    data: {
      kind: "DEVOLUCION",
      originalSaleId: original.id,
      returnReason: input.reason,
      channel: original.channel,
      status: "ENTREGADA",
      clientId: original.clientId,
      userId: user.id,
      cashSessionId: session.id,
      branchId: branch.id,
      invoiceType,
      pointOfSale,
      invoiceNumber,
      arcaStatus: isFiscal(invoiceType) ? "PENDIENTE" : "NO_APLICA",
      subtotal: D(totals.subtotal),
      taxTotal: D(totals.taxTotal),
      total: D(totalReturned),
      items: {
        create: lines.map((l, i) => ({
          productId: l.item.productId,
          variantId: l.item.variantId,
          description: l.item.description,
          quantity: D(l.quantity),
          unitPrice: D(new Decimal(l.lineTotal).div(l.quantity).toDecimalPlaces(2)),
          vatRate: l.item.vatRate,
          subtotal: D(totals.lines[i].total),
          unitCost: l.item.unitCost,
          originalItemId: l.item.id,
          restocked: l.restock,
        })),
      },
    },
    select: { id: true, number: true },
  });

  for (const l of lines) {
    // La prenda vuelve al stock del local donde se hace la devolución.
    if (l.restock) await adjustBranchStock(tx, l.item.variantId!, branch.id, D(l.quantity));
  }

  // --- Reintegro
  const concept = `Devolución #${nc.number} (venta #${original.number})`;
  let cashRegisterId: string | null = null;
  let movementId: string | null = null;
  if (input.refundMethod === "CUENTA_CORRIENTE") {
    const debt = original.receivables[0];
    if (!debt || debt.balance.lt(totalReturned)) {
      throw new SaleError(`La deuda pendiente de la venta #${original.number} es ${formatMoney(debt?.balance.toNumber() ?? 0)}: reintegrá la diferencia por otro medio`);
    }
    const balance = new Decimal(debt.balance.toString()).minus(totalReturned);
    await tx.accountReceivable.update({ where: { id: debt.id }, data: { balance: D(balance), status: balance.lte(0) ? "CANCELADO" : "PARCIAL" } });
  } else {
    const target =
      input.refundMethod === "EFECTIVO"
        ? register
        : await tx.cashRegister.findFirst({ where: { active: true, defaultForMethods: { has: input.refundMethod } } });
    if (!target) throw new SaleError(`No hay una cuenta configurada para reintegrar por ${METHOD_LABELS[input.refundMethod]}`);
    const locked = await lockRegister(tx, target.id);
    const mov = await addMovement(tx, {
      register: locked,
      type: "EGRESO",
      method: input.refundMethod,
      amount: totalReturned,
      concept: `${concept}${input.reference ? ` — ${input.reference}` : ""}`,
      userId: user.id,
      saleId: nc.id,
    });
    cashRegisterId = locked.id;
    movementId = mov.id;
  }
  await tx.payment.create({
    data: {
      method: input.refundMethod,
      amount: D(totalReturned),
      reference: input.reference,
      saleId: nc.id,
      cashRegisterId,
      cashMovementId: movementId,
      createdById: user.id,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: user.id,
      entity: "Sale",
      entityId: nc.id,
      action: "RETURN",
      reason: input.reason,
      data: { originalSale: original.number, total: totalReturned, refund: input.refundMethod, restocked: lines.filter((l) => l.restock).length },
    },
  });

  return { ...nc, total: totalReturned, fiscal: isFiscal(invoiceType) };
}
