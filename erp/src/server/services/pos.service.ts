/**
 * Venta de mostrador.
 *  - Los precios de prendas del catálogo los calcula el servidor (lista neta +
 *    IVA + ajuste de talle); solo los ítems libres llevan precio manual.
 *  - Todo descuento exige permiso y motivo, y queda auditado.
 *  - Efectivo al cajón del turno; tarjetas/QR/transferencias a su cuenta;
 *    cheques a cartera; cuenta corriente genera deuda con control de límite.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { InvoiceType } from "@/generated/prisma/enums";
import { variantLabel } from "@/lib/catalog/variants";
import { isFiscal } from "@/lib/arca/codes";
import { formatMoney } from "@/lib/format";
import { addDays, computeSaleTotals, finalUnitPrice, planPayments, SaleError } from "@/lib/pos/sale-math";
import { TreasuryError } from "@/lib/treasury/cash";
import type { SaleInput } from "@/lib/validations/treasury";
import { registerCollections } from "@/server/services/collection.service";
import { lockRegister, openSessionOf } from "@/server/services/treasury.service";
import { adjustBranchStock } from "@/server/services/stock.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

/** Siguiente número de ticket interno del punto de venta (bloquea la sucursal para no repetir). */
export async function nextInternalNumber(tx: Tx, branchId: string, pointOfSale: number) {
  await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId} FOR UPDATE`;
  const last = await tx.sale.aggregate({ where: { invoiceType: "TICKET_INTERNO", pointOfSale }, _max: { invoiceNumber: true } });
  return (last._max.invoiceNumber ?? 0) + 1;
}

export async function clientOpenBalance(tx: Tx, clientId: string) {
  const agg = await tx.accountReceivable.aggregate({ where: { clientId, status: { in: ["PENDIENTE", "PARCIAL"] } }, _sum: { balance: true } });
  return agg._sum.balance?.toNumber() ?? 0;
}

export async function createSale(tx: Tx, input: SaleInput, user: { id: string; name: string; canDiscount: boolean }) {
  const register = await lockRegister(tx, input.registerId);
  if (register.kind !== "CAJA_DIARIA" || !register.branchId) throw new SaleError("Las ventas se registran en la caja diaria de un local");
  const session = await openSessionOf(tx, register.id);
  if (!session) throw new TreasuryError(`"${register.name}" no tiene un turno abierto`);
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: register.branchId } });

  const client = input.clientId ? await tx.client.findUnique({ where: { id: input.clientId } }) : null;
  if (input.clientId && (!client || !client.active)) throw new SaleError("Cliente inexistente o inactivo");

  // --- Comprobante
  if (input.invoiceType === "FACTURA_A" && (client?.taxCondition !== "RESPONSABLE_INSCRIPTO" || client.documentType !== "CUIT" || !client.documentNumber)) {
    throw new SaleError("La factura A requiere un cliente responsable inscripto con CUIT");
  }

  // --- Ítems con precio del servidor
  const variantIds = input.items.flatMap((i) => (i.variantId ? [i.variantId] : []));
  const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: true } });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines = input.items.map((i, idx) => {
    if (i.variantId) {
      const v = byId.get(i.variantId);
      if (!v || !v.active || !v.product.active) throw new SaleError(`Línea ${idx + 1}: artículo inexistente o inactivo`);
      const vatRate = v.product.vatRate.toNumber();
      const listPrice = v.product.listPrice.toNumber();
      if (listPrice <= 0) throw new SaleError(`${v.product.name} no tiene precio de lista`);
      return {
        input: i,
        variant: v,
        description: variantLabel(v.product.name, v),
        unitPrice: finalUnitPrice(listPrice, vatRate, v.priceAdjustmentPct.toNumber()),
        vatRate,
        unitCost: v.product.currentCost,
      };
    }
    return { input: i, variant: null, description: i.description!, unitPrice: i.unitPrice, vatRate: 21, unitCost: new Prisma.Decimal(0) };
  });

  // Un ítem libre lleva precio a mano: lo carga quien puede hacer descuentos (si no, cualquier prenda se cobraría al precio que se quiera).
  if (!user.canDiscount && input.items.some((i) => !i.variantId)) throw new SaleError("Los ítems libres (precio a mano) los carga un usuario con permiso de descuento");
  const hasDiscount = input.globalDiscountPct > 0 || input.items.some((i) => i.discountPct > 0);
  if (hasDiscount) {
    if (!user.canDiscount) throw new SaleError("Tu usuario no puede aplicar descuentos");
    if (!input.discountReason || input.discountReason.length < 3) throw new SaleError("Indicá el motivo del descuento");
  }

  const totals = computeSaleTotals(
    lines.map((l) => ({ quantity: l.input.quantity, unitPrice: l.unitPrice, discountPct: l.input.discountPct, vatRate: l.vatRate })),
    input.globalDiscountPct,
  );
  const plan = planPayments(totals.total, input.payments);

  // --- Cuenta corriente y cheques requieren cliente
  const needsClient = input.payments.some((p) => ["CUENTA_CORRIENTE", "CHEQUE", "ECHEQ"].includes(p.method));
  if (needsClient && !client) throw new SaleError("Para cobrar en cuenta corriente o con cheque elegí el cliente");
  if (plan.onAccount > 0 && client) {
    const balance = await clientOpenBalance(tx, client.id);
    const limit = client.creditLimit.toNumber();
    if (balance + plan.onAccount > limit) {
      throw new SaleError(`Supera el límite de crédito de ${client.businessName}: debe ${formatMoney(balance)}, límite ${formatMoney(limit)}`);
    }
  }

  // --- Numeración: los tickets internos se numeran acá; las facturas reciben número y CAE de ARCA.
  const pointOfSale = branch.pointOfSale ?? 1;
  const fiscal = isFiscal(input.invoiceType as InvoiceType);
  const invoiceNumber = fiscal ? null : await nextInternalNumber(tx, branch.id, pointOfSale);

  const sale = await tx.sale.create({
    data: {
      channel: "MOSTRADOR",
      status: input.deliveryMethod === "ENVIO" ? "CONFIRMADA" : "ENTREGADA",
      clientId: client?.id ?? null,
      userId: user.id,
      cashSessionId: session.id,
      branchId: branch.id,
      invoiceType: input.invoiceType,
      pointOfSale,
      invoiceNumber,
      arcaStatus: fiscal ? "PENDIENTE" : "NO_APLICA",
      subtotal: D(totals.subtotal),
      discountTotal: D(totals.discountTotal),
      discountReason: hasDiscount ? input.discountReason : null,
      taxTotal: D(totals.taxTotal),
      total: D(totals.total),
      changeAmount: D(plan.change),
      deliveryMethod: input.deliveryMethod,
      shippingAddress: input.shippingAddress,
      notes: input.notes,
      items: {
        create: lines.map((l, i) => ({
          productId: l.variant?.productId ?? null,
          variantId: l.variant?.id ?? null,
          description: l.description,
          quantity: D(l.input.quantity),
          unitPrice: D(l.unitPrice),
          discountPct: D(l.input.discountPct),
          discountReason: l.input.discountPct > 0 ? input.discountReason : null,
          vatRate: D(l.vatRate),
          subtotal: D(totals.lines[i].total),
          unitCost: l.unitCost,
        })),
      },
    },
    select: { id: true, number: true },
  });

  // --- Stock
  const warnings: string[] = [];
  for (const l of lines) {
    if (!l.variant) continue;
    // Sale del stock del local de la caja.
    const updated = await adjustBranchStock(tx, l.variant.id, branch.id, D(l.input.quantity).neg(), { reason: "VENTA", refType: "VENTA", refId: sale.id, userId: user.id, notes: `Venta #${sale.number}` });
    if (updated.branch.lt(0)) warnings.push(`${l.description}: stock negativo en ${branch.name} (${updated.branch.toNumber()})`);
  }

  // --- Cobros
  await registerCollections(tx, input.payments, {
    drawerId: register.id,
    clientId: client?.id ?? null,
    userId: user.id,
    concept: `Venta #${sale.number}`,
    link: { saleId: sale.id },
    cashKept: plan.cashKept,
  });

  if (plan.onAccount > 0 && client) {
    await tx.accountReceivable.create({
      data: {
        clientId: client.id,
        saleId: sale.id,
        description: `Venta #${sale.number} en cuenta corriente`,
        dueDate: addDays(new Date(), client.paymentTermDays),
        amount: D(plan.onAccount),
        balance: D(plan.onAccount),
      },
    });
  }

  if (hasDiscount) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        entity: "Sale",
        entityId: sale.id,
        action: "DISCOUNT",
        reason: input.discountReason,
        data: { number: sale.number, discountTotal: totals.discountTotal, globalPct: input.globalDiscountPct },
      },
    });
  }

  return { ...sale, total: totals.total, change: plan.change, warnings, fiscal };
}
