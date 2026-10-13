import "server-only";

import type { ClientType, LeadStatus, QuoteStatus } from "@/generated/prisma/enums";
import { effectiveQuoteStatus } from "@/lib/crm/quote-math";
import { whatsappNumber } from "@/lib/masters/fields";
import { db } from "@/server/db";
import { voucherLabel } from "@/server/queries/sales.queries";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ─── Presupuestos ─────────────────────────────────────────────────────────

export interface QuoteRow {
  id: string;
  number: number;
  date: string;
  validUntil: string;
  status: QuoteStatus;
  partyName: string;
  clientId: string | null;
  userName: string;
  total: number;
}

export async function listQuotes(status: QuoteStatus | null, q: string | null): Promise<QuoteRow[]> {
  const number = q && /^\d+$/.test(q.trim()) ? Number(q.trim()) : null;
  const today = new Date(new Date().toDateString());
  const statusWhere =
    status === "VENCIDO"
      ? { OR: [{ status: "VENCIDO" as const }, { status: { in: ["BORRADOR", "ENVIADO"] as QuoteStatus[] }, validUntil: { lt: today } }] }
      : status === "BORRADOR" || status === "ENVIADO"
        ? { status, validUntil: { gte: today } }
        : status
          ? { status }
          : {};
  const quotes = await db.quote.findMany({
    where: {
      ...statusWhere,
      ...(number !== null
        ? { number }
        : q
          ? { OR: [{ client: { businessName: { contains: q, mode: "insensitive" } } }, { lead: { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } }] }
          : {}),
    },
    orderBy: { number: "desc" },
    take: 300,
    include: { client: { select: { businessName: true } }, lead: { select: { name: true, company: true } }, user: { select: { name: true } } },
  });
  return quotes.map((x) => ({
    id: x.id,
    number: x.number,
    date: x.createdAt.toISOString(),
    validUntil: x.validUntil.toISOString(),
    status: effectiveQuoteStatus(x.status, x.validUntil),
    partyName: x.client?.businessName ?? x.lead?.company ?? x.lead?.name ?? "—",
    clientId: x.clientId,
    userName: x.user.name,
    total: x.total.toNumber(),
  }));
}

export async function getQuotePipelineSummary() {
  const today = new Date(new Date().toDateString());
  const [open, accepted] = await Promise.all([
    db.quote.aggregate({ where: { status: { in: ["BORRADOR", "ENVIADO"] }, validUntil: { gte: today } }, _sum: { total: true }, _count: true }),
    db.quote.aggregate({ where: { status: "ACEPTADO", closedAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } }, _sum: { total: true }, _count: true }),
  ]);
  return {
    openCount: open._count,
    openTotal: open._sum.total?.toNumber() ?? 0,
    acceptedMonthCount: accepted._count,
    acceptedMonthTotal: accepted._sum.total?.toNumber() ?? 0,
  };
}

export async function getQuoteFormData() {
  const [clients, leads, products] = await Promise.all([
    db.client.findMany({
      where: { active: true },
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, documentNumber: true, taxCondition: true, paymentTermDays: true },
    }),
    db.lead.findMany({
      where: { status: { notIn: ["GANADO", "PERDIDO"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, company: true, clientId: true },
    }),
    db.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, listPrice: true, vatRate: true, variants: { where: { active: true }, select: { size: true }, orderBy: { createdAt: "asc" } } },
    }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.businessName, document: c.documentNumber, taxCondition: c.taxCondition, paymentTermDays: c.paymentTermDays })),
    leads: leads.map((l) => ({ id: l.id, label: l.company ? `${l.company} (${l.name})` : l.name, clientId: l.clientId })),
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      listPrice: p.listPrice.toNumber(),
      vatRate: p.vatRate.toNumber(),
      sizes: [...new Set(p.variants.map((v) => v.size))].join(" / "),
    })),
  };
}

export type QuoteFormData = Awaited<ReturnType<typeof getQuoteFormData>>;

export async function getQuoteDetail(id: string) {
  const q = await db.quote.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { product: { select: { id: true, sku: true } } } },
      client: true,
      lead: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!q) return null;
  return {
    id: q.id,
    number: q.number,
    status: effectiveQuoteStatus(q.status, q.validUntil),
    storedStatus: q.status,
    createdAt: q.createdAt.toISOString(),
    validUntil: q.validUntil.toISOString(),
    sentAt: iso(q.sentAt),
    closedAt: iso(q.closedAt),
    paymentTerms: q.paymentTerms,
    deliveryTerms: q.deliveryTerms,
    notes: q.notes,
    subtotal: q.subtotal.toNumber(),
    taxTotal: q.taxTotal.toNumber(),
    total: q.total.toNumber(),
    userName: q.user.name,
    userEmail: q.user.email,
    client: q.client
      ? {
          id: q.client.id,
          name: q.client.businessName,
          document: q.client.documentNumber ? `${q.client.documentType} ${q.client.documentNumber}` : null,
          taxCondition: q.client.taxCondition,
          address: [q.client.address, q.client.city, q.client.province].filter(Boolean).join(", ") || null,
          email: q.client.email,
          phone: q.client.phone ?? q.client.whatsapp,
          type: q.client.type,
          whatsapp: whatsappNumber(q.client.whatsapp ?? q.client.phone),
        }
      : null,
    lead: q.lead
      ? { id: q.lead.id, name: q.lead.name, company: q.lead.company, email: q.lead.email, phone: q.lead.phone, whatsapp: whatsappNumber(q.lead.phone), status: q.lead.status }
      : null,
    items: q.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      sku: i.product?.sku ?? null,
      description: i.description,
      quantity: i.quantity.toNumber(),
      unitPrice: i.unitPrice.toNumber(),
      discountPct: i.discountPct.toNumber(),
      vatRate: i.vatRate.toNumber(),
      subtotal: i.subtotal.toNumber(),
    })),
  };
}

export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuoteDetail>>>;

// ─── Oportunidades ────────────────────────────────────────────────────────

export interface LeadCard {
  id: string;
  name: string;
  company: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  expectedClose: string | null;
  source: string | null;
  ownerName: string | null;
  clientId: string | null;
  quotes: number;
  updatedAt: string;
  /** Pasó la fecha de cierre esperada y sigue abierta */
  overdue: boolean;
}

export async function listLeads(q: string | null, ownerId: string | null): Promise<LeadCard[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const leads = await db.lead.findMany({
    where: {
      // Ganadas y perdidas: solo las de los últimos 90 días para no saturar el tablero.
      OR: [{ status: { notIn: ["GANADO", "PERDIDO"] } }, { updatedAt: { gte: since } }],
      ...(ownerId ? { ownerId } : {}),
      ...(q ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] }] } : {}),
    },
    orderBy: [{ expectedClose: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    include: { owner: { select: { name: true } }, _count: { select: { quotes: true } } },
  });
  return leads.map((l) => ({
    id: l.id,
    name: l.name,
    company: l.company,
    status: l.status,
    estimatedValue: l.estimatedValue?.toNumber() ?? null,
    expectedClose: iso(l.expectedClose),
    source: l.source,
    ownerName: l.owner?.name ?? null,
    clientId: l.clientId,
    quotes: l._count.quotes,
    updatedAt: l.updatedAt.toISOString(),
    overdue: !!l.expectedClose && l.expectedClose.getTime() < Date.now() && l.status !== "GANADO" && l.status !== "PERDIDO",
  }));
}

export async function getLeadFormData() {
  const [clients, users] = await Promise.all([
    db.client.findMany({ where: { active: true }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { clients: clients.map((c) => ({ id: c.id, name: c.businessName })), users };
}

export async function getLead(id: string) {
  const l = await db.lead.findUnique({
    where: { id },
    include: { client: { select: { id: true, businessName: true } }, owner: { select: { name: true } }, quotes: { orderBy: { number: "desc" } } },
  });
  if (!l) return null;
  return {
    form: {
      id: l.id,
      name: l.name,
      company: l.company,
      email: l.email,
      phone: l.phone,
      source: l.source,
      status: l.status,
      estimatedValue: l.estimatedValue?.toNumber() ?? null,
      expectedClose: l.expectedClose ? l.expectedClose.toISOString().slice(0, 10) : null,
      notes: l.notes,
      lostReason: l.lostReason,
      clientId: l.clientId,
      ownerId: l.ownerId,
    },
    clientName: l.client?.businessName ?? null,
    whatsapp: whatsappNumber(l.phone),
    createdAt: l.createdAt.toISOString(),
    quotes: l.quotes.map((x) => ({ id: x.id, number: x.number, status: effectiveQuoteStatus(x.status, x.validUntil), total: x.total.toNumber(), date: x.createdAt.toISOString() })),
  };
}

// ─── Cliente 360° ─────────────────────────────────────────────────────────

export async function getClient360(id: string) {
  const client = await db.client.findUnique({ where: { id }, include: { designs: { orderBy: { createdAt: "desc" } } } });
  if (!client) return null;
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const [sales, salesYear, returnsYear, lastSale, receivables, quotes, leads, orders, topProducts] = await Promise.all([
    db.sale.findMany({
      where: { clientId: id, status: { not: "ANULADA" } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { branch: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    db.sale.aggregate({ where: { clientId: id, kind: "VENTA", status: { not: "ANULADA" }, createdAt: { gte: yearAgo } }, _sum: { total: true }, _count: true }),
    db.sale.aggregate({ where: { clientId: id, kind: "DEVOLUCION", status: { not: "ANULADA" }, createdAt: { gte: yearAgo } }, _sum: { total: true } }),
    db.sale.findFirst({ where: { clientId: id, kind: "VENTA", status: { not: "ANULADA" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.accountReceivable.findMany({ where: { clientId: id, status: { in: ["PENDIENTE", "PARCIAL"] } }, select: { balance: true, dueDate: true } }),
    db.quote.findMany({ where: { clientId: id }, orderBy: { number: "desc" }, take: 10 }),
    db.lead.findMany({ where: { clientId: id }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.productionOrder.findMany({ where: { clientId: id }, orderBy: { number: "desc" }, take: 10, include: { product: { select: { name: true } } } }),
    db.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { clientId: id, kind: "VENTA", status: { not: "ANULADA" } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 5,
    }),
  ]);
  const productNames = new Map(
    (await db.product.findMany({ where: { id: { in: topProducts.map((t) => t.productId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
  const now = Date.now();
  const balance = receivables.reduce((a, r) => a + r.balance.toNumber(), 0);
  const overdue = receivables.filter((r) => r.dueDate.getTime() < now).reduce((a, r) => a + r.balance.toNumber(), 0);
  const yearTotal = (salesYear._sum.total?.toNumber() ?? 0) - (returnsYear._sum.total?.toNumber() ?? 0);

  return {
    id: client.id,
    name: client.businessName,
    fantasyName: client.fantasyName,
    type: client.type as ClientType,
    active: client.active,
    document: client.documentNumber ? `${client.documentType} ${client.documentNumber}` : null,
    taxCondition: client.taxCondition,
    email: client.email,
    phone: client.phone,
    whatsapp: whatsappNumber(client.whatsapp ?? client.phone),
    whatsappRaw: client.whatsapp ?? client.phone,
    address: [client.address, client.city, client.province, client.postalCode].filter(Boolean).join(", ") || null,
    tags: client.tags,
    purchaseMonths: client.purchaseMonths,
    notes: client.notes,
    creditLimit: client.creditLimit.toNumber(),
    paymentTermDays: client.paymentTermDays,
    createdAt: client.createdAt.toISOString(),
    kpis: {
      yearTotal,
      yearCount: salesYear._count,
      avgTicket: salesYear._count ? yearTotal / salesYear._count : 0,
      lastPurchase: iso(lastSale?.createdAt),
      daysSinceLastPurchase: lastSale ? Math.floor((now - lastSale.createdAt.getTime()) / 86_400_000) : null,
      balance,
      overdue,
      availableCredit: client.creditLimit.toNumber() > 0 ? Math.max(0, client.creditLimit.toNumber() - balance) : null,
    },
    sales: sales.map((s) => ({
      id: s.id,
      number: s.number,
      kind: s.kind,
      date: s.createdAt.toISOString(),
      voucher: voucherLabel(s),
      branch: s.branch?.name ?? null,
      items: s._count.items,
      total: s.total.toNumber(),
    })),
    quotes: quotes.map((x) => ({ id: x.id, number: x.number, status: effectiveQuoteStatus(x.status, x.validUntil), total: x.total.toNumber(), date: x.createdAt.toISOString() })),
    leads: leads.map((l) => ({ id: l.id, name: l.name, status: l.status, estimatedValue: l.estimatedValue?.toNumber() ?? null })),
    orders: orders.map((o) => ({ id: o.id, number: o.number, product: o.product.name, status: o.status, stage: o.currentStage, quantity: o.quantityPlanned, dueDate: iso(o.dueDate) })),
    topProducts: topProducts.map((t) => ({
      name: (t.productId && productNames.get(t.productId)) || "Otros",
      quantity: t._sum.quantity?.toNumber() ?? 0,
      total: t._sum.subtotal?.toNumber() ?? 0,
    })),
    designs: client.designs.map((d) => ({
      id: d.id,
      name: d.name,
      colors: d.institutionalColors,
      stitchCount: d.stitchCount,
      sizeCurve: (d.sizeCurve as Record<string, number> | null) ?? null,
      notes: d.notes,
      logoUrl: d.vectorLogoUrl,
      embroideryUrl: d.embroideryFileUrl,
    })),
  };
}

export type Client360 = NonNullable<Awaited<ReturnType<typeof getClient360>>>;

// ─── Campañas ─────────────────────────────────────────────────────────────

export interface SegmentFilter {
  types: ClientType[];
  tags: string[];
  month: number | null;
  /** Sin compras en los últimos N días (reactivación) */
  inactiveDays: number | null;
  channel: "whatsapp" | "email" | "todos";
}

export async function segmentClients(f: SegmentFilter) {
  const clients = await db.client.findMany({
    where: {
      active: true,
      ...(f.types.length ? { type: { in: f.types } } : {}),
      ...(f.tags.length ? { tags: { hasSome: f.tags } } : {}),
      ...(f.month ? { purchaseMonths: { has: f.month } } : {}),
      ...(f.channel === "email" ? { email: { not: null } } : {}),
      ...(f.channel === "whatsapp" ? { OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] } : {}),
    },
    orderBy: { businessName: "asc" },
    take: 2000,
    include: { sales: { where: { kind: "VENTA", status: { not: "ANULADA" } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  const cutoff = f.inactiveDays ? Date.now() - f.inactiveDays * 86_400_000 : null;
  return clients
    .map((c) => ({
      id: c.id,
      name: c.businessName,
      contactName: c.fantasyName ?? c.businessName,
      email: c.email,
      whatsapp: whatsappNumber(c.whatsapp ?? c.phone),
      tags: c.tags,
      lastPurchase: iso(c.sales[0]?.createdAt),
    }))
    .filter((c) => (cutoff ? !c.lastPurchase || new Date(c.lastPurchase).getTime() < cutoff : true))
    .filter((c) => (f.channel === "whatsapp" ? !!c.whatsapp : true));
}

export type SegmentClient = Awaited<ReturnType<typeof segmentClients>>[number];

export async function listClientTags() {
  const rows = await db.client.findMany({ where: { active: true }, select: { tags: true } });
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}
