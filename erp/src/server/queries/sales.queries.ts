import "server-only";

import type { ArcaStatus, InvoiceType, PaymentMethod, SaleKind } from "@/generated/prisma/enums";
import { CBTE_TIPO, voucherNumber } from "@/lib/arca/codes";
import { buildQrUrl, receiverFor } from "@/lib/arca/invoice";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { arcaEnabled, companyInfo } from "@/server/arca/config";
import { db } from "@/server/db";
import { INVOICE_LABELS } from "@/server/queries/treasury.queries";
import { returnedQuantities } from "@/server/services/returns.service";
import { voidBlocker } from "@/server/services/sale-void.service";

export type SalesFilter = "todas" | "pendientes" | "devoluciones";

export interface SaleRow {
  id: string;
  number: number;
  kind: SaleKind;
  voided: boolean;
  date: string;
  branchName: string | null;
  clientName: string | null;
  voucher: string;
  invoiceType: InvoiceType;
  arcaStatus: ArcaStatus;
  arcaError: string | null;
  total: number;
}

export function voucherLabel(s: { invoiceType: InvoiceType; pointOfSale: number | null; invoiceNumber: number | null; arcaStatus: ArcaStatus }) {
  const label = INVOICE_LABELS[s.invoiceType];
  if (s.invoiceType !== "TICKET_INTERNO" && s.arcaStatus !== "AUTORIZADO") return `${label} (sin CAE)`;
  return `${label} ${voucherNumber(s.pointOfSale, s.invoiceNumber)}`;
}

export async function listSales(filter: SalesFilter, q: string | null): Promise<SaleRow[]> {
  const number = q && /^\d+$/.test(q.trim()) ? Number(q.trim()) : null;
  const sales = await db.sale.findMany({
    where: {
      ...(filter === "pendientes" ? { arcaStatus: { in: ["PENDIENTE", "RECHAZADO"] } } : {}),
      ...(filter === "devoluciones" ? { kind: "DEVOLUCION" } : {}),
      ...(number !== null ? { OR: [{ number }, { invoiceNumber: number }] } : q ? { client: { businessName: { contains: q, mode: "insensitive" } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { branch: { select: { name: true } }, client: { select: { businessName: true } } },
  });
  return sales.map((s) => ({
    id: s.id,
    number: s.number,
    kind: s.kind,
    voided: s.status === "ANULADA",
    date: s.createdAt.toISOString(),
    branchName: s.branch?.name ?? null,
    clientName: s.client?.businessName ?? null,
    voucher: voucherLabel(s),
    invoiceType: s.invoiceType,
    arcaStatus: s.arcaStatus,
    arcaError: s.arcaError,
    total: s.total.toNumber(),
  }));
}

export async function countPendingCae() {
  return db.sale.count({ where: { arcaStatus: { in: ["PENDIENTE", "RECHAZADO"] } } });
}

export async function getSaleDetail(id: string) {
  const s = await db.sale.findUnique({
    where: { id },
    include: {
      items: { orderBy: { id: "asc" }, include: { variant: { select: { id: true, productId: true, priceAdjustmentPct: true } } } },
      payments: { include: { cheque: true, storeCredit: { select: { id: true, code: true } } } },
      branch: true,
      user: { select: { name: true } },
      client: { select: { id: true, businessName: true } },
      priceList: { select: { name: true } },
      originalSale: { select: { id: true, number: true, invoiceType: true, pointOfSale: true, invoiceNumber: true, arcaStatus: true } },
      returns: { orderBy: { createdAt: "asc" }, select: { id: true, number: true, total: true, createdAt: true, status: true, invoiceType: true, pointOfSale: true, invoiceNumber: true, arcaStatus: true } },
      receivables: { where: { status: { in: ["PENDIENTE", "PARCIAL"] } }, select: { balance: true } },
    },
  });
  if (!s) return null;
  const returned = s.kind === "VENTA" ? await returnedQuantities(db, s.id) : new Map();
  const registers = await db.cashRegister.findMany({
    where: { active: true, kind: "CAJA_DIARIA", sessions: { some: { status: "ABIERTA" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  // Talles a los que se puede cambiar cada prenda (misma prenda, mismo precio).
  const productIds = [...new Set(s.items.flatMap((i) => (i.variant ? [i.variant.productId] : [])))];
  const siblings = productIds.length
    ? await db.productVariant.findMany({
        where: { productId: { in: productIds }, active: true },
        select: { id: true, productId: true, size: true, color: true, fabric: true, priceAdjustmentPct: true, branchStocks: { select: { branchId: true, quantity: true } } },
      })
    : [];
  const voidReason = voidBlocker({ ...s, activeReturns: s.returns.filter((r) => r.status !== "ANULADA").length });
  return {
    id: s.id,
    number: s.number,
    kind: s.kind,
    status: s.status,
    voidBlocker: voidReason,
    branchId: s.branchId,
    date: s.createdAt.toISOString(),
    branchName: s.branch?.name ?? null,
    cashier: s.user.name,
    client: s.client,
    invoiceType: s.invoiceType,
    voucher: voucherLabel(s),
    arca: {
      status: s.arcaStatus,
      error: s.arcaError,
      cae: s.cae,
      caeDueDate: s.caeDueDate?.toISOString() ?? null,
      attempts: s.arcaAttempts,
      observations: (s.arcaObservations as { code: string; message: string }[] | null) ?? [],
      enabled: arcaEnabled(),
    },
    returnReason: s.returnReason,
    original: s.originalSale ? { id: s.originalSale.id, number: s.originalSale.number, voucher: voucherLabel(s.originalSale) } : null,
    returns: s.returns.map((r) => ({ id: r.id, number: r.number, total: r.total.toNumber(), date: r.createdAt.toISOString(), voucher: voucherLabel(r) })),
    subtotal: s.subtotal.toNumber(),
    taxTotal: s.taxTotal.toNumber(),
    discountTotal: s.discountTotal.toNumber(),
    discountReason: s.discountReason,
    priceListName: s.priceList?.name ?? null,
    total: s.total.toNumber(),
    change: s.changeAmount.toNumber(),
    items: s.items.map((i) => {
      const prev = returned.get(i.id) as { quantity: number } | undefined;
      return {
        id: i.id,
        description: i.description,
        quantity: i.quantity.toNumber(),
        unitPrice: i.unitPrice.toNumber(),
        discountPct: i.discountPct.toNumber(),
        total: i.subtotal.toNumber(),
        returnable: i.quantity.toNumber() - (prev?.quantity ?? 0),
        isProduct: i.variantId !== null,
        restocked: i.restocked,
        exchangeOptions: i.variant
          ? siblings
              .filter((v) => v.productId === i.variant!.productId && v.id !== i.variant!.id && v.priceAdjustmentPct.equals(i.variant!.priceAdjustmentPct))
              .sort((a, b) => (a.color ?? "").localeCompare(b.color ?? "", "es") || (a.fabric ?? "").localeCompare(b.fabric ?? "", "es") || compareSizes(a.size, b.size))
              .map((v) => ({
                id: v.id,
                label: `T.${v.size}${variantAttrs(v) ? ` · ${variantAttrs(v)}` : ""}`,
                stocks: Object.fromEntries(v.branchStocks.map((b) => [b.branchId, b.quantity.toNumber()])),
              }))
          : [],
      };
    }),
    payments: s.payments.map((p) => ({
      method: p.method as PaymentMethod,
      amount: p.amount.toNumber(),
      detail: p.cheque ? `${p.cheque.bank} N° ${p.cheque.number}` : (p.storeCredit?.code ?? p.reference ?? null),
      storeCreditId: p.storeCredit?.id ?? null,
    })),
    accountDebt: s.receivables.reduce((a, r) => a + r.balance.toNumber(), 0),
    openRegisters: registers,
  };
}

export type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSaleDetail>>>;

/** Datos fiscales para imprimir: CAE, vencimiento y QR (solo comprobantes autorizados). */
export async function fiscalDataFor(saleId: string) {
  const s = await db.sale.findUnique({ where: { id: saleId }, include: { client: true } });
  if (!s || !s.cae || !s.invoiceNumber || !s.pointOfSale) return null;
  const company = companyInfo();
  const cbteTipo = CBTE_TIPO[s.invoiceType];
  if (!company.cuit || !cbteTipo) return null;
  const receiver = receiverFor(s.invoiceType, s.client);
  return {
    cae: s.cae,
    caeDueDate: s.caeDueDate?.toISOString() ?? null,
    qrUrl: buildQrUrl({
      // Misma fecha que se informó a ARCA: la de la venta, o la de autorización si se autorizó con más de 4 días de atraso.
      date: s.arcaAuthorizedAt && s.arcaAuthorizedAt.getTime() - s.createdAt.getTime() > 4 * 86_400_000 ? s.arcaAuthorizedAt : s.createdAt,
      issuerCuit: company.cuit,
      pointOfSale: s.pointOfSale,
      cbteTipo,
      number: s.invoiceNumber,
      total: s.total.toNumber(),
      docTipo: receiver.docTipo,
      docNro: receiver.docNro,
      cae: s.cae,
    }),
  };
}
