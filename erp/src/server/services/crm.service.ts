import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { LeadStatus, QuoteStatus } from "@/generated/prisma/enums";
import { computeQuoteTotals, effectiveQuoteStatus, isEditableQuote, QUOTE_TRANSITIONS, QuoteError } from "@/lib/crm/quote-math";
import { QUOTE_STATUS_LABELS } from "@/lib/masters/labels";
import { type DesignInput, type LeadInput, parseSizeCurve, type QuoteInput } from "@/lib/validations/crm";

type Tx = Prisma.TransactionClient;
const D = (v: number) => new Prisma.Decimal(v);

/** Oportunidades que todavía no llegaron a presupuesto avanzan solas al cotizarlas. */
const EARLY_LEAD: LeadStatus[] = ["NUEVO", "CONTACTADO"];

export async function saveQuote(tx: Tx, input: QuoteInput, userId: string) {
  const totals = computeQuoteTotals(input.items);
  if (input.clientId && !(await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } }))) throw new QuoteError("Cliente inexistente");
  const lead = input.leadId ? await tx.lead.findUnique({ where: { id: input.leadId } }) : null;
  if (input.leadId && !lead) throw new QuoteError("Oportunidad inexistente");

  const header = {
    clientId: input.clientId ?? lead?.clientId ?? null,
    leadId: input.leadId,
    validUntil: new Date(`${input.validUntil.slice(0, 10)}T12:00:00`),
    paymentTerms: input.paymentTerms,
    deliveryTerms: input.deliveryTerms,
    notes: input.notes,
    subtotal: D(totals.subtotal),
    taxTotal: D(totals.taxTotal),
    total: D(totals.total),
  };
  const items = input.items.map((it, i) => ({
    productId: it.productId,
    description: it.description,
    quantity: D(it.quantity),
    unitPrice: D(it.unitPrice),
    discountPct: D(it.discountPct),
    vatRate: D(it.vatRate),
    subtotal: D(totals.lines[i].net),
    sortOrder: i,
  }));

  let quote;
  if (input.id) {
    const current = await tx.quote.findUnique({ where: { id: input.id } });
    if (!current) throw new QuoteError("Presupuesto inexistente");
    if (!isEditableQuote(current.status)) throw new QuoteError(`Un presupuesto ${QUOTE_STATUS_LABELS[current.status].toLowerCase()} no se puede modificar: duplicalo para hacer una nueva versión`);
    await tx.quoteItem.deleteMany({ where: { quoteId: input.id } });
    quote = await tx.quote.update({ where: { id: input.id }, data: { ...header, items: { create: items } } });
  } else {
    quote = await tx.quote.create({ data: { ...header, userId, status: "BORRADOR", items: { create: items } } });
  }
  if (lead && EARLY_LEAD.includes(lead.status)) {
    await tx.lead.update({ where: { id: lead.id }, data: { status: "PRESUPUESTADO", estimatedValue: lead.estimatedValue ?? D(totals.total) } });
  }
  return { id: quote.id, number: quote.number, total: totals.total };
}

export async function setQuoteStatus(tx: Tx, id: string, status: QuoteStatus, userId: string) {
  const quote = await tx.quote.findUnique({ where: { id }, include: { lead: true } });
  if (!quote) throw new QuoteError("Presupuesto inexistente");
  const current = effectiveQuoteStatus(quote.status, quote.validUntil);
  if (status === "VENCIDO" || !QUOTE_TRANSITIONS[current].includes(status)) {
    throw new QuoteError(`No se puede pasar de ${QUOTE_STATUS_LABELS[current]} a ${QUOTE_STATUS_LABELS[status]}`);
  }
  const now = new Date();
  const data: Prisma.QuoteUpdateInput = { status };
  if (status === "ENVIADO") {
    data.sentAt = quote.sentAt ?? now;
    data.closedAt = null;
    // Reenviar un presupuesto vencido extiende su validez 15 días.
    if (current === "VENCIDO") data.validUntil = new Date(now.getTime() + 15 * 86_400_000);
  }
  if (status === "ACEPTADO" || status === "RECHAZADO") data.closedAt = now;
  await tx.quote.update({ where: { id }, data });

  if (quote.lead && status === "ACEPTADO") {
    await tx.lead.update({ where: { id: quote.lead.id }, data: { status: "GANADO", estimatedValue: quote.total, lostReason: null } });
  } else if (quote.lead && status === "ENVIADO" && EARLY_LEAD.includes(quote.lead.status)) {
    await tx.lead.update({ where: { id: quote.lead.id }, data: { status: "PRESUPUESTADO" } });
  }
  await tx.auditLog.create({ data: { userId, entity: "Quote", entityId: id, action: `STATUS_${status}`, data: { from: current } } });
  return { number: quote.number, status };
}

/** Nueva versión editable de un presupuesto (mismo cliente e ítems, validez de 15 días). */
export async function duplicateQuote(tx: Tx, id: string, userId: string) {
  const q = await tx.quote.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!q) throw new QuoteError("Presupuesto inexistente");
  const copy = await tx.quote.create({
    data: {
      clientId: q.clientId,
      leadId: q.leadId,
      userId,
      status: "BORRADOR",
      validUntil: new Date(Date.now() + 15 * 86_400_000),
      paymentTerms: q.paymentTerms,
      deliveryTerms: q.deliveryTerms,
      notes: q.notes,
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      total: q.total,
      items: {
        create: q.items.map((it) => ({
          productId: it.productId,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountPct: it.discountPct,
          vatRate: it.vatRate,
          subtotal: it.subtotal,
          sortOrder: it.sortOrder,
        })),
      },
    },
  });
  return { id: copy.id, number: copy.number };
}

// ─── Oportunidades ────────────────────────────────────────────────────────

function leadData(input: LeadInput) {
  return {
    name: input.name,
    company: input.company,
    email: input.email,
    phone: input.phone,
    source: input.source,
    status: input.status,
    estimatedValue: input.estimatedValue === null ? null : D(input.estimatedValue),
    expectedClose: input.expectedClose ? new Date(`${input.expectedClose.slice(0, 10)}T12:00:00`) : null,
    notes: input.notes,
    lostReason: input.status === "PERDIDO" ? input.lostReason : null,
    clientId: input.clientId,
    ownerId: input.ownerId,
  };
}

export async function saveLead(tx: Tx, input: LeadInput, userId: string) {
  if (input.status === "PERDIDO" && !input.lostReason) throw new QuoteError("Indicá el motivo por el que se perdió la oportunidad");
  const data = leadData(input);
  const lead = input.id ? await tx.lead.update({ where: { id: input.id }, data }) : await tx.lead.create({ data: { ...data, ownerId: data.ownerId ?? userId } });
  return { id: lead.id };
}

export async function setLeadStatus(tx: Tx, id: string, status: LeadStatus, lostReason: string | null | undefined, userId: string) {
  if (status === "PERDIDO" && !lostReason) throw new QuoteError("Indicá el motivo por el que se perdió la oportunidad");
  const lead = await tx.lead.update({ where: { id }, data: { status, lostReason: status === "PERDIDO" ? lostReason : null } });
  await tx.auditLog.create({ data: { userId, entity: "Lead", entityId: id, action: `STATUS_${status}`, reason: lostReason ?? null } });
  return lead;
}

/** Da de alta como cliente al contacto de una oportunidad y le asigna sus presupuestos. */
export async function convertLeadToClient(tx: Tx, leadId: string, userId: string) {
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new QuoteError("Oportunidad inexistente");
  if (lead.clientId) return { clientId: lead.clientId, created: false };
  const client = await tx.client.create({
    data: {
      type: lead.company ? "EMPRESA" : "PARTICULAR",
      businessName: lead.company ?? lead.name,
      email: lead.email,
      phone: lead.phone,
      whatsapp: lead.phone,
      notes: [lead.company ? `Contacto: ${lead.name}` : null, lead.source ? `Origen: ${lead.source}` : null].filter(Boolean).join("\n") || null,
    },
  });
  await tx.lead.update({ where: { id: lead.id }, data: { clientId: client.id } });
  await tx.quote.updateMany({ where: { leadId: lead.id, clientId: null }, data: { clientId: client.id } });
  await tx.auditLog.create({ data: { userId, entity: "Client", entityId: client.id, action: "CREATE_FROM_LEAD", data: { leadId } } });
  return { clientId: client.id, created: true };
}

// ─── Diseños / logos del cliente ──────────────────────────────────────────

export async function addClientDesign(tx: Tx, input: DesignInput) {
  const curve = input.sizeCurve ? parseSizeCurve(input.sizeCurve) : null;
  return tx.clientDesign.create({
    data: {
      clientId: input.clientId,
      name: input.name,
      institutionalColors: input.colors
        .split(/[,;]+/)
        .map((c) => c.trim())
        .filter(Boolean),
      stitchCount: input.stitchCount,
      sizeCurve: curve && Object.keys(curve).length ? curve : Prisma.DbNull,
      vectorLogoUrl: input.vectorLogoUrl || null,
      notes: input.notes,
    },
  });
}

export async function deleteClientDesign(tx: Tx, id: string) {
  const used = await tx.productionOrder.count({ where: { clientDesignId: id } });
  if (used) throw new QuoteError(`El diseño se usó en ${used} órdenes de producción: no se puede borrar`);
  return tx.clientDesign.delete({ where: { id } });
}
