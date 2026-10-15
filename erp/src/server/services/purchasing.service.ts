/**
 * Compras y cuentas a pagar.
 *
 *  - MERCADERIA: telas, avíos/insumos/empaque y producto terminado. Suben stock,
 *    actualizan el costo de reposición y recalculan las fichas en cascada.
 *  - SERVICIO_TALLER: factura de un taller sobre recepciones ya registradas.
 *    Reemplaza la deuda provisoria de cada remito por la deuda de la factura
 *    (sin duplicarla) y ajusta el costo real de la orden si cambió el precio.
 *  - Órdenes de pago: imputan un pago a varios comprobantes y registran el
 *    egreso en la caja / cuenta elegida.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { InvoiceType, PaymentMethod, PurchaseItemType } from "@/generated/prisma/enums";
import { registerAcceptsMethod } from "@/lib/treasury/cash";
import { chequeLabel } from "@/lib/treasury/cheques";
import { endorseCheque, issueOwnCheque } from "@/server/services/cheque.service";
import { addMovement, lockRegister } from "@/server/services/treasury.service";
import { formatMoney } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/production/workflow";
import {
  addDays,
  allocatePayment,
  computePurchaseTotals,
  convertToStockUnit,
  costChange,
  purchasableUoms,
  PurchasingError,
} from "@/lib/purchasing/math";
import { PAYMENT_METHOD_LABELS, PURCHASE_INVOICE_LABELS } from "@/lib/validations/purchasing";
import type { MerchandisePurchaseInput, PaymentInstrument, PaymentOrderInput, WorkshopInvoiceInput } from "@/lib/validations/purchasing";
import { periodLabel, SALARY_CONCEPT_LABELS, type SalaryPaymentInput } from "@/lib/validations/payroll";
import { priceFromCost } from "@/lib/costing/escandallo";
import { updateRawMaterialCost } from "@/server/services/costing.service";
import { moveRawMaterial } from "@/server/services/materials.service";
import { adjustBranchStock, mainBranchId } from "@/server/services/stock.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

export function invoiceLabel(p: { invoiceType: InvoiceType | null; pointOfSale: number | null; invoiceNumber: string | null; remitNumber?: string | null }) {
  if (!p.invoiceType || p.invoiceType === "TICKET_INTERNO") return p.remitNumber ? `Remito ${p.remitNumber}` : "Sin comprobante";
  const label = PURCHASE_INVOICE_LABELS[p.invoiceType as keyof typeof PURCHASE_INVOICE_LABELS] ?? p.invoiceType;
  return `${label} ${String(p.pointOfSale ?? 0).padStart(5, "0")}-${(p.invoiceNumber ?? "").padStart(8, "0")}`;
}

async function assertNotDuplicated(
  tx: Tx,
  where: { supplierId?: string; workshopId?: string },
  input: { invoiceType: string; pointOfSale: number | null; invoiceNumber: string | null },
) {
  if (input.invoiceType === "TICKET_INTERNO" || !input.invoiceNumber) return;
  // Bloqueo por comprobante: un doble envío del formulario espera al primero y ve que ya está cargado.
  const key = `purchase:${where.supplierId ?? where.workshopId}:${input.invoiceType}:${input.pointOfSale ?? 0}:${input.invoiceNumber}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  const dup = await tx.purchase.findFirst({
    where: {
      ...where,
      invoiceType: input.invoiceType as InvoiceType,
      pointOfSale: input.pointOfSale,
      invoiceNumber: input.invoiceNumber,
      status: { not: "ANULADA" },
    },
    select: { number: true },
  });
  if (dup) throw new PurchasingError(`Ese comprobante ya está cargado (compra #${dup.number})`);
}

export interface CostAlert {
  code: string;
  name: string;
  previous: number;
  next: number;
  deltaPct: number | null;
}

export interface AffectedProduct {
  sku: string;
  name: string;
  previousCost: number;
  newCost: number;
  /** El precio de lista quedó por debajo del sugerido con el nuevo costo. */
  marginAlert: boolean;
}

export interface MerchandiseResult {
  id: string;
  number: number;
  costAlerts: CostAlert[];
  affectedProducts: AffectedProduct[];
}

export async function createMerchandisePurchase(tx: Tx, input: MerchandisePurchaseInput, userId: string): Promise<MerchandiseResult> {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier || !supplier.active) throw new PurchasingError("Proveedor inexistente o inactivo");
  await assertNotDuplicated(tx, { supplierId: supplier.id }, input);

  const rawIds = input.items.flatMap((i) => (i.kind === "RAW" && i.rawMaterialId ? [i.rawMaterialId] : []));
  const variantIds = input.items.flatMap((i) => (i.kind === "VARIANT" && i.productVariantId ? [i.productVariantId] : []));
  const [materials, variants] = await Promise.all([
    tx.rawMaterial.findMany({ where: { id: { in: rawIds } } }),
    tx.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: true } }),
  ]);
  const matById = new Map(materials.map((m) => [m.id, m]));
  const varById = new Map(variants.map((v) => [v.id, v]));

  // 1) Resolver cada línea (tipo, descripción, conversión a unidad de stock).
  const resolved = input.items.map((item, i) => {
    const n = i + 1;
    if (item.kind === "RAW") {
      const m = matById.get(item.rawMaterialId!);
      if (!m || !m.active) throw new PurchasingError(`Línea ${n}: materia prima inexistente o inactiva`);
      const mpk = m.metersPerKg?.toNumber() ?? null;
      if (!purchasableUoms(m.uom, mpk).includes(item.uom)) throw new PurchasingError(`Línea ${n}: ${m.name} no se puede comprar en esa unidad`);
      const conv = convertToStockUnit({ purchasedUom: item.uom, stockUom: m.uom, metersPerKg: mpk, quantity: item.quantity, unitCost: item.unitCost });
      const itemType: PurchaseItemType = m.type === "TELA" ? "MATERIA_PRIMA" : "AVIO_INSUMO";
      return { item, itemType, description: `${m.code} · ${m.name}`, material: m, variant: null, ...conv, previous: m.currentCost.toNumber() };
    }
    const v = varById.get(item.productVariantId!);
    if (!v || !v.active) throw new PurchasingError(`Línea ${n}: artículo inexistente o inactivo`);
    if (item.uom !== "UNIDAD") throw new PurchasingError(`Línea ${n}: el producto terminado se compra por unidad`);
    if (!Number.isInteger(item.quantity)) throw new PurchasingError(`Línea ${n}: la cantidad de prendas debe ser entera`);
    return {
      item,
      itemType: "PRODUCTO_TERMINADO" as PurchaseItemType,
      description: `${v.sku} · ${v.product.name} T.${v.size}`,
      material: null,
      variant: v,
      stockQuantity: item.quantity,
      stockUnitCost: item.unitCost,
      previous: v.product.currentCost.toNumber(),
    };
  });

  const totals = computePurchaseTotals(
    input.items.map((i) => ({ quantity: i.quantity, unitCost: i.unitCost, vatRate: i.vatRate })),
    { perceptionIva: input.perceptionIva, perceptionIibb: input.perceptionIibb, otherTaxes: input.otherTaxes },
    input.invoiceType,
  );
  const date = new Date(input.date);
  const dueDate = input.dueDate ? new Date(input.dueDate) : addDays(date, supplier.paymentTermDays);

  // 2) Comprobante.
  const purchase = await tx.purchase.create({
    data: {
      kind: "MERCADERIA",
      supplierId: supplier.id,
      invoiceType: input.invoiceType,
      pointOfSale: input.pointOfSale,
      invoiceNumber: input.invoiceNumber,
      remitNumber: input.remitNumber,
      status: "RECIBIDA",
      date,
      dueDate,
      subtotal: D(totals.subtotal),
      taxTotal: D(totals.taxTotal),
      vat21: D(totals.vat21),
      vat105: D(totals.vat105),
      vat27: D(totals.vat27),
      perceptionIva: D(totals.perceptionIva),
      perceptionIibb: D(totals.perceptionIibb),
      otherTaxes: D(totals.otherTaxes),
      total: D(totals.total),
      notes: input.notes,
      createdById: userId,
      items: {
        create: resolved.map((r, i) => ({
          itemType: r.itemType,
          description: r.description,
          rawMaterialId: r.material?.id ?? null,
          productVariantId: r.variant?.id ?? null,
          quantity: D(r.item.quantity),
          uom: r.item.uom,
          unitCost: D(r.item.unitCost),
          vatRate: D(r.item.vatRate),
          subtotal: D(totals.lines[i].subtotal),
          stockQuantity: D(r.stockQuantity),
          stockUnitCost: D(r.stockUnitCost),
          previousUnitCost: D(r.previous),
          updatedCost: r.item.updateCost && r.stockUnitCost !== r.previous && (r.material !== null || r.variant!.product.sourcing === "REVENTA"),
        })),
      },
    },
    select: { id: true, number: true },
  });

  // 3) Stock y costos de reposición.
  const costAlerts: CostAlert[] = [];
  const affected = new Map<string, AffectedProduct>();
  for (const r of resolved) {
    if (r.material) {
      await moveRawMaterial(tx, { rawMaterialId: r.material.id, delta: D(r.stockQuantity), reason: "COMPRA", refType: "COMPRA", refId: purchase.id, unitCost: r.stockUnitCost, userId });
      if (r.item.updateCost && r.stockUnitCost !== r.previous) {
        const change = costChange(r.previous, r.stockUnitCost);
        if (change.increased) costAlerts.push({ code: r.material.code, name: r.material.name, previous: r.previous, next: r.stockUnitCost, deltaPct: change.deltaPct });
        const { affected: recalcs } = await updateRawMaterialCost(tx, {
          rawMaterialId: r.material.id,
          newCost: r.stockUnitCost,
          userId,
          source: "COMPRA",
          purchaseId: purchase.id,
        });
        for (const a of recalcs) {
          const prev = affected.get(a.productId);
          affected.set(a.productId, {
            sku: a.sku,
            name: a.name,
            previousCost: prev?.previousCost ?? a.previousCost,
            newCost: a.newCost,
            marginAlert: a.marginAlert,
          });
        }
      }
    } else if (r.variant) {
      // La mercadería comprada ingresa al local principal (después se puede transferir).
      await adjustBranchStock(tx, r.variant.id, await mainBranchId(tx), D(r.stockQuantity));
      const product = r.variant.product;
      if (r.item.updateCost && product.sourcing === "REVENTA" && r.stockUnitCost !== r.previous) {
        const change = costChange(r.previous, r.stockUnitCost);
        if (change.increased) costAlerts.push({ code: product.sku, name: product.name, previous: r.previous, next: r.stockUnitCost, deltaPct: change.deltaPct });
        await tx.product.update({ where: { id: product.id }, data: { currentCost: D(r.stockUnitCost), costUpdatedAt: new Date() } });
        await tx.productCostSnapshot.create({
          data: {
            productId: product.id,
            reason: "COMPRA",
            materialsCost: D(r.stockUnitCost),
            servicesCost: D(0),
            overheadCost: D(0),
            totalCost: D(r.stockUnitCost),
            suggestedPrice: product.listPrice,
            breakdown: { source: "COMPRA", purchaseId: purchase.id, previousCost: r.previous },
            userId,
          },
        });
        const suggested = priceFromCost(new Decimal(r.stockUnitCost), product.pricingMode, new Decimal(product.pricingPct.toString()));
        const listPrice = new Decimal(product.listPrice.toString());
        affected.set(product.id, {
          sku: product.sku,
          name: product.name,
          previousCost: r.previous,
          newCost: r.stockUnitCost,
          marginAlert: listPrice.gt(0) && listPrice.lt(suggested),
        });
      }
    }
  }

  // 4) Deuda con el proveedor.
  if (totals.total > 0) {
    await tx.accountPayable.create({
      data: {
        supplierId: supplier.id,
        purchaseId: purchase.id,
        description: `${invoiceLabel(input)} — compra #${purchase.number}`,
        issueDate: date,
        dueDate,
        amount: D(totals.total),
        balance: D(totals.total),
      },
    });
  }

  return { ...purchase, costAlerts, affectedProducts: [...affected.values()] };
}

export async function createWorkshopInvoice(tx: Tx, input: WorkshopInvoiceInput, userId: string) {
  const workshop = await tx.workshop.findUnique({ where: { id: input.workshopId } });
  if (!workshop || !workshop.active) throw new PurchasingError("Taller inexistente o inactivo");
  await assertNotDuplicated(tx, { workshopId: workshop.id }, input);

  const remitIds = input.lines.map((l) => l.remitId);
  if (new Set(remitIds).size !== remitIds.length) throw new PurchasingError("Hay recepciones repetidas");
  await tx.$queryRaw`SELECT id FROM workshop_remits WHERE id IN (${Prisma.join(remitIds)}) FOR UPDATE`;
  const remits = await tx.workshopRemit.findMany({
    where: { id: { in: remitIds } },
    include: { productionOrder: { select: { id: true, number: true } } },
  });
  const byId = new Map(remits.map((r) => [r.id, r]));
  for (const id of remitIds) {
    const r = byId.get(id);
    if (!r || r.workshopId !== workshop.id || r.type !== "RECEPCION") throw new PurchasingError("Hay recepciones que no son de este taller");
    if (r.purchaseId) throw new PurchasingError(`La recepción #${r.number} ya fue facturada`);
    if (r.pieces <= 0) throw new PurchasingError(`La recepción #${r.number} no tiene piezas a facturar`);
  }

  const totals = computePurchaseTotals(
    input.lines.map((l) => ({ quantity: byId.get(l.remitId)!.pieces, unitCost: l.unitCost, vatRate: l.vatRate })),
    { perceptionIva: input.perceptionIva, perceptionIibb: input.perceptionIibb, otherTaxes: input.otherTaxes },
    input.invoiceType,
  );
  const date = new Date(input.date);
  const dueDate = input.dueDate ? new Date(input.dueDate) : addDays(date, workshop.paymentTermDays);

  const purchase = await tx.purchase.create({
    data: {
      kind: "SERVICIO_TALLER",
      workshopId: workshop.id,
      invoiceType: input.invoiceType,
      pointOfSale: input.pointOfSale,
      invoiceNumber: input.invoiceNumber,
      remitNumber: input.remitNumber,
      status: "RECIBIDA",
      date,
      dueDate,
      subtotal: D(totals.subtotal),
      taxTotal: D(totals.taxTotal),
      vat21: D(totals.vat21),
      vat105: D(totals.vat105),
      vat27: D(totals.vat27),
      perceptionIva: D(totals.perceptionIva),
      perceptionIibb: D(totals.perceptionIibb),
      otherTaxes: D(totals.otherTaxes),
      total: D(totals.total),
      notes: input.notes,
      createdById: userId,
      items: {
        create: input.lines.map((l, i) => {
          const r = byId.get(l.remitId)!;
          const personalization = r.stage === "EN_PERSONALIZACION";
          return {
            itemType: personalization ? ("SERVICIO_PERSONALIZACION" as const) : ("SERVICIO_CONFECCION" as const),
            description: `${STAGE_LABELS[r.stage]} OP #${r.productionOrder.number} — recepción #${r.number}`,
            workshopRemitId: r.id,
            quantity: D(r.pieces),
            uom: "UNIDAD" as const,
            unitCost: D(l.unitCost),
            vatRate: D(l.vatRate),
            subtotal: D(totals.lines[i].subtotal),
            previousUnitCost: r.laborUnitCost,
          };
        }),
      },
    },
    select: { id: true, number: true },
  });

  // Ajuste del costo real de cada orden si el taller facturó distinto a lo pactado en la recepción.
  for (const [i, l] of input.lines.entries()) {
    const r = byId.get(l.remitId)!;
    const diff = new Decimal(totals.lines[i].subtotal).minus(r.laborTotal.toString());
    if (!diff.isZero()) {
      await tx.productionOrder.update({ where: { id: r.productionOrder.id }, data: { actualCost: { increment: D(diff) } } });
    }
  }
  await tx.workshopRemit.updateMany({ where: { id: { in: remitIds } }, data: { purchaseId: purchase.id } });

  // La factura reemplaza la deuda provisoria de cada recepción. Los pagos ya hechos se reimputan a la factura.
  // Se bloquean esas deudas: una orden de pago simultánea espera y después ve la deuda ya reemplazada.
  await tx.$queryRaw`SELECT id FROM accounts_payable WHERE "workshopRemitId" IN (${Prisma.join(remitIds)}) FOR UPDATE`;
  const provisional = await tx.accountPayable.findMany({
    where: { workshopRemitId: { in: remitIds }, status: { not: "ANULADO" } },
    include: { payments: { select: { id: true, amount: true } } },
  });
  const alreadyPaid = provisional.reduce((a, p) => a.plus(p.payments.reduce((b, x) => b.plus(x.amount.toString()), new Decimal(0))), new Decimal(0));
  const balance = Decimal.max(new Decimal(totals.total).minus(alreadyPaid), 0);
  const payable = await tx.accountPayable.create({
    data: {
      workshopId: workshop.id,
      purchaseId: purchase.id,
      description: `${invoiceLabel(input)} — fasón (compra #${purchase.number})`,
      issueDate: date,
      dueDate,
      amount: D(totals.total),
      balance: D(balance),
      status: balance.isZero() ? "CANCELADO" : alreadyPaid.gt(0) ? "PARCIAL" : "PENDIENTE",
    },
  });
  if (provisional.length > 0) {
    await tx.payment.updateMany({ where: { accountPayableId: { in: provisional.map((p) => p.id) } }, data: { accountPayableId: payable.id } });
    await tx.accountPayable.updateMany({
      where: { id: { in: provisional.map((p) => p.id) } },
      data: { status: "ANULADO", balance: D(0) },
    });
  }

  return { ...purchase, replacedProvisional: provisional.length, total: totals.total };
}

export async function annulPurchase(tx: Tx, input: { purchaseId: string; reason: string }, userId: string) {
  await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${input.purchaseId} FOR UPDATE`;
  const purchase = await tx.purchase.findUnique({
    where: { id: input.purchaseId },
    include: { items: true, payables: { include: { _count: { select: { payments: true } } } }, invoicedRemits: true },
  });
  if (!purchase) throw new PurchasingError("Compra inexistente");
  if (purchase.status === "ANULADA") throw new PurchasingError("La compra ya está anulada");
  if (purchase.payables.some((p) => p._count.payments > 0)) {
    throw new PurchasingError("El comprobante tiene pagos imputados; no se puede anular");
  }

  if (purchase.kind === "MERCADERIA") {
    for (const it of purchase.items) {
      const qty = it.stockQuantity ?? it.quantity;
      if (it.rawMaterialId) await moveRawMaterial(tx, { rawMaterialId: it.rawMaterialId, delta: qty.neg(), reason: "ANULACION_COMPRA", refType: "COMPRA", refId: purchase.id, userId });
      if (it.productVariantId) await adjustBranchStock(tx, it.productVariantId, await mainBranchId(tx), qty.neg());
    }
  } else {
    const remitIds = purchase.invoicedRemits.map((r) => r.id);
    for (const it of purchase.items) {
      if (!it.workshopRemitId) continue;
      const r = purchase.invoicedRemits.find((x) => x.id === it.workshopRemitId);
      if (!r) continue;
      const diff = new Decimal(it.subtotal.toString()).minus(r.laborTotal.toString());
      if (!diff.isZero()) await tx.productionOrder.update({ where: { id: r.productionOrderId }, data: { actualCost: { decrement: D(diff) } } });
    }
    await tx.workshopRemit.updateMany({ where: { id: { in: remitIds } }, data: { purchaseId: null } });
    // Restaurar la deuda provisoria de cada recepción.
    const provisional = await tx.accountPayable.findMany({ where: { workshopRemitId: { in: remitIds }, status: "ANULADO" } });
    for (const p of provisional) {
      await tx.accountPayable.update({ where: { id: p.id }, data: { status: "PENDIENTE", balance: p.amount } });
    }
  }

  await tx.accountPayable.updateMany({ where: { purchaseId: purchase.id }, data: { status: "ANULADO", balance: D(0) } });
  await tx.purchase.update({ where: { id: purchase.id }, data: { status: "ANULADA" } });
  await tx.auditLog.create({
    data: { userId, entity: "Purchase", entityId: purchase.id, action: "ANNUL", reason: input.reason, data: { number: purchase.number, kind: purchase.kind } },
  });
  return { number: purchase.number, kind: purchase.kind };
}

export async function createPaymentOrder(tx: Tx, input: PaymentOrderInput, userId: string) {
  const isSupplier = input.creditorType === "SUPPLIER";
  const creditor = isSupplier
    ? await tx.supplier.findUnique({ where: { id: input.creditorId }, select: { id: true, businessName: true } })
    : await tx.workshop.findUnique({ where: { id: input.creditorId }, select: { id: true, name: true } });
  if (!creditor) throw new PurchasingError("Acreedor inexistente");
  const creditorName = "businessName" in creditor ? creditor.businessName : creditor.name;

  await tx.$queryRaw`SELECT id FROM accounts_payable WHERE id IN (${Prisma.join(input.payableIds)}) FOR UPDATE`;
  const payables = await tx.accountPayable.findMany({ where: { id: { in: input.payableIds } } });
  if (payables.length !== new Set(input.payableIds).size) throw new PurchasingError("Algún comprobante no existe");
  for (const p of payables) {
    const owner = isSupplier ? p.supplierId : p.workshopId;
    if (owner !== creditor.id) throw new PurchasingError("Hay comprobantes de otro acreedor");
    if (p.status !== "PENDIENTE" && p.status !== "PARCIAL") throw new PurchasingError(`"${p.description}" no tiene saldo pendiente`);
  }

  const { total, summaryMethod, cheques } = await instrumentsTotal(tx, input.instruments);

  const allocations = allocatePayment(
    total.toNumber(),
    payables.map((p) => ({ id: p.id, balance: p.balance.toNumber(), dueDate: p.dueDate })),
  );

  const order = await tx.paymentOrder.create({
    data: {
      supplierId: isSupplier ? creditor.id : null,
      workshopId: isSupplier ? null : creditor.id,
      method: summaryMethod,
      amount: D(total),
      notes: input.notes,
      createdById: userId,
    },
    select: { id: true, number: true },
  });
  await applyInstruments(tx, { orderId: order.id, concept: `Orden de pago #${order.number} — ${creditorName}`, payee: creditorName, instruments: input.instruments, cheques }, userId);

  for (const a of allocations) {
    const p = payables.find((x) => x.id === a.payableId)!;
    const newBalance = new Decimal(p.balance.toString()).minus(a.amount);
    await tx.payment.create({
      data: { method: summaryMethod, amount: D(a.amount), accountPayableId: p.id, paymentOrderId: order.id, createdById: userId },
    });
    await tx.accountPayable.update({
      where: { id: p.id },
      data: { balance: D(newBalance), status: newBalance.lte(0) ? "CANCELADO" : "PARCIAL" },
    });
  }

  return { ...order, allocated: allocations.length, message: `Orden de pago #${order.number} por ${formatMoney(total.toNumber())} registrada` };
}

// ─── Medios de pago de una orden (proveedores, talleres y sueldos) ────────

/** Total de los instrumentos (los cheques de terceros se toman por su importe completo). */
async function instrumentsTotal(tx: Tx, instruments: PaymentInstrument[]) {
  const chequeIds = instruments.flatMap((i) => (i.type === "THIRD_CHEQUE" ? [i.chequeId] : []));
  if (new Set(chequeIds).size !== chequeIds.length) throw new PurchasingError("Hay cheques repetidos");
  const cheques = chequeIds.length ? await tx.cheque.findMany({ where: { id: { in: chequeIds } } }) : [];
  const amountOf = (i: PaymentInstrument) =>
    i.type === "THIRD_CHEQUE" ? new Decimal(cheques.find((c) => c.id === i.chequeId)?.amount.toString() ?? "0") : new Decimal(i.amount);
  const total = instruments.reduce((a, i) => a.plus(amountOf(i)), new Decimal(0)).toDecimalPlaces(2);
  const methods = new Set(instruments.map((i) => (i.type === "REGISTER" ? i.method : i.type === "OWN_CHEQUE" ? (i.format === "ECHEQ" ? "ECHEQ" : "CHEQUE") : "CHEQUE")));
  const summaryMethod = (methods.size === 1 ? [...methods][0] : "MIXTO") as PaymentMethod;
  return { total, summaryMethod, cheques };
}

/** Registra cada instrumento: egreso de caja/cuenta, endoso de cheque de terceros o emisión de cheque propio. */
async function applyInstruments(
  tx: Tx,
  o: { orderId: string; concept: string; payee: string; instruments: PaymentInstrument[]; cheques: { id: string }[] },
  userId: string,
) {
  for (const inst of o.instruments) {
    if (inst.type === "REGISTER") {
      const register = await lockRegister(tx, inst.cashRegisterId);
      if (!registerAcceptsMethod(register.kind, inst.method)) {
        throw new PurchasingError(`${PAYMENT_METHOD_LABELS[inst.method]} no puede salir de ${register.name}`);
      }
      await addMovement(tx, {
        register,
        type: "EGRESO",
        method: inst.method,
        amount: inst.amount,
        concept: `${o.concept} (${PAYMENT_METHOD_LABELS[inst.method]}${inst.reference ? ` ${inst.reference}` : ""})`,
        userId,
        paymentOrderId: o.orderId,
      });
      await tx.paymentOrderItem.create({
        data: { paymentOrderId: o.orderId, method: inst.method, amount: D(inst.amount), cashRegisterId: register.id, reference: inst.reference },
      });
    } else if (inst.type === "THIRD_CHEQUE") {
      const cheque = await endorseCheque(tx, inst.chequeId, o.orderId, o.payee);
      await tx.paymentOrderItem.create({
        data: { paymentOrderId: o.orderId, method: cheque.format === "ECHEQ" ? "ECHEQ" : "CHEQUE", amount: cheque.amount, chequeId: cheque.id, reference: chequeLabel(cheque) },
      });
    } else {
      const cheque = await issueOwnCheque(
        tx,
        {
          format: inst.format,
          bankRegisterId: inst.bankRegisterId,
          number: inst.number,
          amount: inst.amount,
          issueDate: new Date(),
          paymentDate: new Date(inst.paymentDate),
          deliveredTo: o.payee,
          paymentOrderId: o.orderId,
        },
        userId,
      );
      await tx.paymentOrderItem.create({
        data: { paymentOrderId: o.orderId, method: inst.format === "ECHEQ" ? "ECHEQ" : "CHEQUE", amount: D(inst.amount), cashRegisterId: inst.bankRegisterId, chequeId: cheque.id, reference: chequeLabel(cheque) },
      });
    }
  }
}

/** Pago de sueldo (o adelanto, aguinaldo, etc.) a un empleado, con los mismos medios que una orden de pago. */
export async function createSalaryPayment(tx: Tx, input: SalaryPaymentInput, userId: string) {
  const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new PurchasingError("Empleado inexistente");
  if (!employee.active) throw new PurchasingError(`${employee.name} está dado de baja`);
  const { total, summaryMethod, cheques } = await instrumentsTotal(tx, input.instruments);
  if (total.lte(0)) throw new PurchasingError("El importe debe ser mayor a 0");

  const order = await tx.paymentOrder.create({
    data: {
      employeeId: employee.id,
      salaryPeriod: input.period,
      salaryConcept: input.concept,
      method: summaryMethod,
      amount: D(total),
      notes: input.notes,
      createdById: userId,
    },
    select: { id: true, number: true },
  });
  const concept = `${SALARY_CONCEPT_LABELS[input.concept]} ${periodLabel(input.period)} — ${employee.name} (pago #${order.number})`;
  await applyInstruments(tx, { orderId: order.id, concept, payee: employee.name, instruments: input.instruments, cheques }, userId);
  await tx.auditLog.create({
    data: { userId, entity: "Employee", entityId: employee.id, action: "SALARY_PAYMENT", data: { order: order.number, period: input.period, concept: input.concept, amount: total.toNumber() } },
  });
  return { ...order, message: `${SALARY_CONCEPT_LABELS[input.concept]} de ${employee.name} por ${formatMoney(total.toNumber())} registrado` };
}
