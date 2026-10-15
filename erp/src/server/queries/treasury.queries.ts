import "server-only";

import type {
  CashMovementType,
  CashRegisterKind,
  ChequeFormat,
  ChequeKind,
  ChequeStatus,
  InvoiceType,
  PaymentMethod,
  ProductCategory,
  TaxCondition,
} from "@/generated/prisma/enums";
import { compareSizes, variantLabel } from "@/lib/catalog/variants";
import { finalUnitPrice } from "@/lib/pos/sale-math";
import { activePriceListRules } from "@/server/services/price-lists.service";
import { agingSummary, type AgingBucket } from "@/lib/purchasing/math";
import { MOVEMENT_SIGN } from "@/lib/treasury/cash";
import { chequeLabel } from "@/lib/treasury/cheques";
import { db } from "@/server/db";
import { registerBalance } from "@/server/services/treasury.service";

const OPEN = ["PENDIENTE", "PARCIAL"] as const;

export const INVOICE_LABELS: Record<InvoiceType, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  NOTA_CREDITO_A: "Nota de crédito A",
  NOTA_CREDITO_B: "Nota de crédito B",
  NOTA_CREDITO_C: "Nota de crédito C",
  TICKET_INTERNO: "Ticket",
};

// ---------------------------------------------------------------------------
// POS
// ---------------------------------------------------------------------------

/** Cajas del POS; con `branchId` (usuario asignado a un local) solo las de ese local. */
export async function getPosHome(branchId: string | null = null) {
  const registers = await db.cashRegister.findMany({
    where: { active: true, kind: "CAJA_DIARIA", ...(branchId ? { branchId } : {}) },
    orderBy: { name: "asc" },
    include: {
      branch: { select: { name: true } },
      sessions: { where: { status: "ABIERTA" }, include: { openedBy: { select: { name: true } }, _count: { select: { sales: true } } } },
    },
  });
  return registers.map((r) => {
    const s = r.sessions[0];
    return {
      id: r.id,
      name: r.name,
      branchName: r.branch?.name ?? null,
      session: s ? { id: s.id, openedAt: s.openedAt.toISOString(), openedBy: s.openedBy.name, sales: s._count.sales } : null,
    };
  });
}

export interface CatalogItem {
  variantId: string;
  productId: string;
  productSku: string;
  sku: string;
  barcode: string | null;
  label: string;
  productName: string;
  category: ProductCategory;
  size: string;
  color: string | null;
  fabric: string | null;
  /** Precio final minorista (IVA incluido, con ajuste de talle) */
  price: number;
  /** Para recalcular con una lista de precios */
  netPrice: number;
  vatRate: number;
  sizeAdjustmentPct: number;
  /** Stock en el local de la caja */
  stock: number;
  /** Stock sumando los locales (sin el mayorista) */
  totalStock: number;
}

export interface PosClient {
  id: string;
  name: string;
  document: string | null;
  taxCondition: TaxCondition;
  canInvoiceA: boolean;
  creditLimit: number;
  balance: number;
  priceListId: string | null;
}

export async function getTerminalData(registerId: string) {
  const register = await db.cashRegister.findUnique({ where: { id: registerId }, include: { branch: true } });
  if (!register || register.kind !== "CAJA_DIARIA" || !register.active) return null;
  const session = await db.cashRegisterSession.findFirst({
    where: { cashRegisterId: register.id, status: "ABIERTA" },
    include: {
      openedBy: { select: { name: true } },
      sales: { orderBy: { number: "desc" }, take: 8, select: { id: true, number: true, kind: true, total: true, createdAt: true, client: { select: { businessName: true } } } },
    },
  });
  const [products, clients, balances, vaults, priceLists] = await Promise.all([
    db.product.findMany({
      where: { active: true, listPrice: { gt: 0 } },
      orderBy: { name: "asc" },
      include: { variants: { where: { active: true }, include: { branchStocks: { where: { branch: { kind: "LOCAL" } }, select: { branchId: true, quantity: true } } } } },
    }),
    db.client.findMany({ where: { active: true }, orderBy: { businessName: "asc" } }),
    db.accountReceivable.groupBy({ by: ["clientId"], where: { status: { in: [...OPEN] } }, _sum: { balance: true } }),
    db.cashRegister.findMany({ where: { active: true, kind: "CAJA_RESGUARDO" }, select: { id: true, name: true } }),
    activePriceListRules(db),
  ]);
  const catalog: CatalogItem[] = products.flatMap((p) =>
    [...p.variants]
      .sort((a, b) => compareSizes(a.size, b.size))
      .map((v) => ({
        variantId: v.id,
        productId: p.id,
        productSku: p.sku,
        sku: v.sku,
        barcode: v.barcode,
        label: variantLabel(p.name, v),
        productName: p.name,
        category: p.category,
        size: v.size,
        color: v.color,
        fabric: v.fabric,
        price: finalUnitPrice(p.listPrice.toNumber(), p.vatRate.toNumber(), v.priceAdjustmentPct.toNumber()),
        netPrice: p.listPrice.toNumber(),
        vatRate: p.vatRate.toNumber(),
        sizeAdjustmentPct: v.priceAdjustmentPct.toNumber(),
        stock: v.branchStocks.find((s) => s.branchId === register.branchId)?.quantity.toNumber() ?? 0,
        // Suma de los locales: el stock mayorista está reservado para pedidos de clientes.
        totalStock: v.branchStocks.reduce((a, s) => a + s.quantity.toNumber(), 0),
      })),
  );
  const balanceOf = new Map(balances.map((b) => [b.clientId, b._sum.balance?.toNumber() ?? 0]));
  return {
    register: { id: register.id, name: register.name, branchId: register.branchId, branchName: register.branch?.name ?? "", branchAddress: register.branch?.address ?? null },
    session: session
      ? {
          id: session.id,
          openedAt: session.openedAt.toISOString(),
          openedBy: session.openedBy.name,
          recentSales: session.sales.map((s) => ({
            id: s.id,
            number: s.number,
            total: (s.kind === "DEVOLUCION" ? -1 : 1) * s.total.toNumber(),
            at: s.createdAt.toISOString(),
            client: s.client?.businessName ?? null,
          })),
        }
      : null,
    catalog,
    clients: clients.map<PosClient>((c) => ({
      id: c.id,
      name: c.fantasyName ? `${c.fantasyName} (${c.businessName})` : c.businessName,
      document: c.documentNumber ? `${c.documentType} ${c.documentNumber}` : null,
      taxCondition: c.taxCondition,
      canInvoiceA: c.taxCondition === "RESPONSABLE_INSCRIPTO" && c.documentType === "CUIT" && !!c.documentNumber,
      creditLimit: c.creditLimit.toNumber(),
      balance: balanceOf.get(c.id) ?? 0,
      priceListId: c.priceListId,
    })),
    vaults,
    priceLists,
  };
}

export type TerminalData = NonNullable<Awaited<ReturnType<typeof getTerminalData>>>;

export async function getSaleForTicket(saleId: string) {
  const s = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { orderBy: { id: "asc" } },
      payments: { include: { cheque: true } },
      branch: true,
      user: { select: { name: true } },
      client: { select: { businessName: true, documentType: true, documentNumber: true, taxCondition: true } },
    },
  });
  if (!s) return null;
  return {
    number: s.number,
    kind: s.kind,
    invoiceType: s.invoiceType,
    voucherLabel: s.kind === "DEVOLUCION" && s.invoiceType === "TICKET_INTERNO" ? "Devolución" : INVOICE_LABELS[s.invoiceType],
    voucherNumber: s.invoiceNumber ?? s.number,
    pointOfSale: s.pointOfSale,
    caePending: s.invoiceType !== "TICKET_INTERNO" && !s.cae,
    cae: s.cae,
    caeDueDate: s.caeDueDate,
    returnReason: s.returnReason,
    date: s.createdAt,
    branchName: s.branch?.name ?? "",
    branchAddress: s.branch?.address ?? null,
    cashier: s.user.name,
    clientName: s.client ? `${s.client.businessName}${s.client.documentNumber ? ` ${s.client.documentType} ${s.client.documentNumber}` : ""}` : null,
    items: s.items.map((i) => ({
      description: i.description,
      quantity: i.quantity.toNumber(),
      unitPrice: i.unitPrice.toNumber(),
      discountPct: i.discountPct.toNumber(),
      total: i.subtotal.toNumber(),
    })),
    discountTotal: s.discountTotal.toNumber(),
    subtotal: s.subtotal.toNumber(),
    taxTotal: s.taxTotal.toNumber(),
    total: s.total.toNumber(),
    change: s.changeAmount.toNumber(),
    payments: s.payments.map((p) => ({
      method: p.method,
      amount: p.amount.toNumber(),
      detail: p.cheque ? `${p.cheque.bank} ${p.cheque.number}` : p.installments && p.installments > 1 ? `${p.installments} cuotas` : (p.reference ?? null),
    })),
  };
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

export async function getSessionReport(sessionId: string) {
  const s = await db.cashRegisterSession.findUnique({
    where: { id: sessionId },
    include: {
      cashRegister: { include: { branch: true } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      movements: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
      sales: { include: { payments: true } },
      receipts: { include: { payments: true, client: { select: { businessName: true } } } },
    },
  });
  if (!s) return null;
  const byMethod = new Map<PaymentMethod, number>();
  const sign = (kind: string) => (kind === "DEVOLUCION" ? -1 : 1);
  for (const x of s.sales.filter((v) => v.status !== "ANULADA")) for (const p of x.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + sign(x.kind) * p.amount.toNumber());
  for (const p of s.receipts.flatMap((x) => x.payments)) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount.toNumber());
  const change = s.sales.reduce((a, x) => a + x.changeAmount.toNumber(), 0);
  return {
    id: s.id,
    status: s.status,
    registerId: s.cashRegisterId,
    registerName: s.cashRegister.name,
    branchName: s.cashRegister.branch?.name ?? null,
    openedBy: s.openedBy.name,
    openedAt: s.openedAt.toISOString(),
    closedBy: s.closedBy?.name ?? null,
    closedAt: s.closedAt?.toISOString() ?? null,
    openingAmount: s.openingAmount.toNumber(),
    openingExpected: s.openingExpected.toNumber(),
    expectedAmount: s.expectedAmount?.toNumber() ?? null,
    declaredAmount: s.declaredAmount?.toNumber() ?? null,
    difference: s.difference?.toNumber() ?? null,
    notes: s.notes,
    salesCount: s.sales.filter((x) => x.kind === "VENTA").length,
    salesTotal: s.sales.filter((x) => x.kind === "VENTA").reduce((a, x) => a + x.total.toNumber(), 0),
    returnsCount: s.sales.filter((x) => x.kind === "DEVOLUCION").length,
    returnsTotal: s.sales.filter((x) => x.kind === "DEVOLUCION").reduce((a, x) => a + x.total.toNumber(), 0),
    receiptsTotal: s.receipts.reduce((a, x) => a + x.amount.toNumber(), 0),
    change,
    byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount: method === "EFECTIVO" ? amount - change : amount })),
    movements: s.movements.map((m) => ({
      id: m.id,
      at: m.createdAt.toISOString(),
      type: m.type,
      amount: m.amount.toNumber(),
      signed: m.amount.toNumber() * MOVEMENT_SIGN[m.type],
      concept: m.concept,
      user: m.user.name,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tesorería
// ---------------------------------------------------------------------------

export interface RegisterOverview {
  id: string;
  name: string;
  kind: CashRegisterKind;
  branchName: string | null;
  requiresSession: boolean;
  openSession: { id: string; openedBy: string; openedAt: string } | null;
  balance: number;
}

export async function listRegistersOverview(): Promise<RegisterOverview[]> {
  const registers = await db.cashRegister.findMany({
    where: { active: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { branch: { select: { name: true } }, sessions: { where: { status: "ABIERTA" }, include: { openedBy: { select: { name: true } } } } },
  });
  return Promise.all(
    registers.map(async (r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      branchName: r.branch?.name ?? null,
      requiresSession: r.requiresSession,
      openSession: r.sessions[0] ? { id: r.sessions[0].id, openedBy: r.sessions[0].openedBy.name, openedAt: r.sessions[0].openedAt.toISOString() } : null,
      balance: await registerBalance(db, r.id),
    })),
  );
}

export async function getChequesSummary() {
  const [third, own, soon] = await Promise.all([
    db.cheque.aggregate({ where: { kind: "TERCERO", status: "EN_CARTERA" }, _sum: { amount: true }, _count: true }),
    db.cheque.aggregate({ where: { kind: "PROPIO", status: "EMITIDO" }, _sum: { amount: true }, _count: true }),
    db.cheque.aggregate({
      where: { kind: "PROPIO", status: "EMITIDO", paymentDate: { lte: new Date(Date.now() + 7 * 86_400_000) } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  return {
    inPortfolio: { count: third._count, amount: third._sum.amount?.toNumber() ?? 0 },
    ownPending: { count: own._count, amount: own._sum.amount?.toNumber() ?? 0 },
    ownNext7Days: { count: soon._count, amount: soon._sum.amount?.toNumber() ?? 0 },
  };
}

export async function getRegisterDetail(registerId: string) {
  const register = await db.cashRegister.findUnique({ where: { id: registerId }, include: { branch: true } });
  if (!register) return null;
  const [movements, sessions, balance] = await Promise.all([
    db.cashMovement.findMany({ where: { cashRegisterId: registerId }, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true } } } }),
    db.cashRegisterSession.findMany({
      where: { cashRegisterId: registerId },
      orderBy: { openedAt: "desc" },
      take: 30,
      include: { openedBy: { select: { name: true } }, closedBy: { select: { name: true } } },
    }),
    registerBalance(db, registerId),
  ]);
  // Saldo corrido hacia atrás desde el saldo actual.
  let running = balance;
  const rows = movements.map((m) => {
    const signed = m.amount.toNumber() * MOVEMENT_SIGN[m.type];
    const row = { id: m.id, at: m.createdAt.toISOString(), type: m.type as CashMovementType, method: m.method, concept: m.concept, user: m.user.name, signed, balanceAfter: running };
    running = Math.round((running - signed) * 100) / 100;
    return row;
  });
  return {
    register: { id: register.id, name: register.name, kind: register.kind, branchName: register.branch?.name ?? null, requiresSession: register.requiresSession },
    balance,
    movements: rows,
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      openedAt: s.openedAt.toISOString(),
      openedBy: s.openedBy.name,
      closedAt: s.closedAt?.toISOString() ?? null,
      closedBy: s.closedBy?.name ?? null,
      difference: s.difference?.toNumber() ?? null,
      declaredAmount: s.declaredAmount?.toNumber() ?? null,
    })),
  };
}

export interface ChequeRow {
  id: string;
  kind: ChequeKind;
  format: ChequeFormat;
  status: ChequeStatus;
  label: string;
  issuerName: string;
  amount: number;
  issueDate: string;
  paymentDate: string;
  clientName: string | null;
  deliveredTo: string | null;
  registerName: string | null;
  paymentOrderId: string | null;
  paymentOrderNumber: number | null;
}

export async function listCheques(kind: ChequeKind, statuses: ChequeStatus[] | null): Promise<ChequeRow[]> {
  const cheques = await db.cheque.findMany({
    where: { kind, ...(statuses ? { status: { in: statuses } } : {}) },
    orderBy: [{ paymentDate: "asc" }],
    take: 500,
    include: { client: { select: { businessName: true } }, cashRegister: { select: { name: true } }, paymentOrder: { select: { id: true, number: true } } },
  });
  return cheques.map((c) => ({
    id: c.id,
    kind: c.kind,
    format: c.format,
    status: c.status,
    label: chequeLabel(c),
    issuerName: c.issuerName,
    amount: c.amount.toNumber(),
    issueDate: c.issueDate.toISOString(),
    paymentDate: c.paymentDate.toISOString(),
    clientName: c.client?.businessName ?? null,
    deliveredTo: c.deliveredTo,
    registerName: c.cashRegister?.name ?? null,
    paymentOrderId: c.paymentOrder?.id ?? null,
    paymentOrderNumber: c.paymentOrder?.number ?? null,
  }));
}

export async function listRegisterOptions() {
  const regs = await db.cashRegister.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { sessions: { where: { status: "ABIERTA" }, select: { id: true } } },
  });
  return regs.map((r) => ({ id: r.id, name: r.name, kind: r.kind, requiresSession: r.requiresSession, hasOpenSession: r.sessions.length > 0 }));
}

// ---------------------------------------------------------------------------
// Cuentas corrientes de clientes
// ---------------------------------------------------------------------------

export interface ClientBalanceRow {
  id: string;
  name: string;
  creditLimit: number;
  balance: number;
  overdue: number;
  aging: Record<AgingBucket, number>;
}

export async function listClientBalances(): Promise<ClientBalanceRow[]> {
  const clients = await db.client.findMany({
    where: { active: true },
    orderBy: { businessName: "asc" },
    include: { receivables: { where: { status: { in: [...OPEN] } }, select: { balance: true, dueDate: true } } },
  });
  return clients
    .map((c) => {
      const items = c.receivables.map((r) => ({ balance: r.balance.toNumber(), dueDate: r.dueDate }));
      const aging = agingSummary(items);
      const balance = items.reduce((a, r) => a + r.balance, 0);
      return { id: c.id, name: c.businessName, creditLimit: c.creditLimit.toNumber(), balance, overdue: balance - aging.A_VENCER, aging };
    })
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "es"));
}

export async function getClientAccount(clientId: string) {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return null;
  const [receivables, receipts, cheques, registers, creditNotes] = await Promise.all([
    db.accountReceivable.findMany({ where: { clientId }, orderBy: { issueDate: "asc" } }),
    db.receipt.findMany({ where: { clientId }, orderBy: { date: "asc" } }),
    db.cheque.findMany({ where: { clientId, kind: "TERCERO" }, orderBy: { paymentDate: "desc" }, take: 30 }),
    listRegisterOptions(),
    db.sale.findMany({
      where: { clientId, kind: "DEVOLUCION", payments: { some: { method: "CUENTA_CORRIENTE" } } },
      include: { payments: { where: { method: "CUENTA_CORRIENTE" } } },
    }),
  ]);
  const events = [
    ...creditNotes.map((n) => ({
      key: `n-${n.id}`,
      at: n.createdAt,
      description: `Devolución #${n.number} (${INVOICE_LABELS[n.invoiceType]})`,
      debit: 0,
      credit: n.payments.reduce((a, p) => a + p.amount.toNumber(), 0),
      href: `/ventas/${n.id}`,
    })),
    ...receivables.map((r) => ({ key: `d-${r.id}`, at: r.issueDate, description: r.description, debit: r.amount.toNumber(), credit: 0, href: r.saleId ? `/pos/tickets/${r.saleId}` : null })),
    ...receipts.map((r) => ({ key: `r-${r.id}`, at: r.date, description: `Recibo #${r.number}`, debit: 0, credit: r.amount.toNumber(), href: `/tesoreria/recibos/${r.id}` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  let running = 0;
  const lines = events.map((e) => {
    running = Math.round((running + e.debit - e.credit) * 100) / 100;
    return { ...e, at: e.at.toISOString(), running };
  });
  const open = receivables.filter((r) => r.status === "PENDIENTE" || r.status === "PARCIAL");
  return {
    client: {
      id: client.id,
      name: client.businessName,
      document: client.documentNumber ? `${client.documentType} ${client.documentNumber}` : null,
      phone: client.phone,
      creditLimit: client.creditLimit.toNumber(),
      paymentTermDays: client.paymentTermDays,
    },
    balance: open.reduce((a, r) => a + r.balance.toNumber(), 0),
    aging: agingSummary(open.map((r) => ({ balance: r.balance.toNumber(), dueDate: r.dueDate }))),
    open: open
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((r) => ({ id: r.id, description: r.description, dueDate: r.dueDate.toISOString(), amount: r.amount.toNumber(), balance: r.balance.toNumber(), fromCheque: r.chequeId !== null })),
    lines,
    cheques: cheques.map((c) => ({ id: c.id, label: chequeLabel(c), status: c.status, amount: c.amount.toNumber(), paymentDate: c.paymentDate.toISOString() })),
    registers: registers.filter((r) => !r.requiresSession || r.hasOpenSession),
  };
}

export type ClientAccount = NonNullable<Awaited<ReturnType<typeof getClientAccount>>>;

export async function getReceiptForPrint(id: string) {
  const r = await db.receipt.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { name: true } },
      payments: { include: { cheque: true } },
      allocations: { include: { accountReceivable: { select: { description: true } } } },
    },
  });
  if (!r) return null;
  return {
    number: r.number,
    date: r.date.toISOString(),
    clientName: r.client.businessName,
    clientDocument: r.client.documentNumber ? `${r.client.documentType} ${r.client.documentNumber}` : null,
    amount: r.amount.toNumber(),
    createdBy: r.createdBy.name,
    notes: r.notes,
    payments: r.payments.map((p) => ({ method: p.method, amount: p.amount.toNumber(), detail: p.cheque ? `${chequeLabel(p.cheque)} — vto. ${p.cheque.paymentDate.toLocaleDateString("es-AR")}` : (p.reference ?? null) })),
    allocations: r.allocations.map((a) => ({ description: a.accountReceivable.description, amount: a.amount.toNumber() })),
  };
}
