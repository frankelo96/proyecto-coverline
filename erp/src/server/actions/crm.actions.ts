"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { QuoteError } from "@/lib/crm/quote-math";
import { formatMoney } from "@/lib/format";
import { LEAD_STATUS_LABELS, QUOTE_STATUS_LABELS } from "@/lib/masters/labels";
import { designSchema, leadSchema, leadStatusSchema, quoteSchema, quoteStatusSchema } from "@/lib/validations/crm";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  addClientDesign,
  convertLeadToClient,
  deleteClientDesign,
  duplicateQuote,
  saveLead,
  saveQuote,
  setLeadStatus,
  setQuoteStatus,
} from "@/server/services/crm.service";

function fail(e: unknown, scope: string): ActionResult<never> {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  if (e instanceof QuoteError || e instanceof AuthorizationError) return { ok: false, error: e.message };
  console.error(`[crm.actions] ${scope}`, e);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

const revalidate = () => revalidatePath("/crm", "layout");

export async function saveQuoteAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.quotesWrite);
    const input = quoteSchema.parse(raw);
    const r = await db.$transaction((tx) => saveQuote(tx, input, user.id));
    revalidate();
    return { ok: true, data: r, message: `Presupuesto N° ${r.number} ${input.id ? "actualizado" : "creado"} por ${formatMoney(r.total)}` };
  } catch (e) {
    return fail(e, "saveQuote");
  }
}

export async function setQuoteStatusAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.quotesWrite);
    const input = quoteStatusSchema.parse(raw);
    const r = await db.$transaction((tx) => setQuoteStatus(tx, input.id, input.status, user.id));
    revalidate();
    return { ok: true, data: undefined, message: `Presupuesto N° ${r.number}: ${QUOTE_STATUS_LABELS[r.status].toLowerCase()}` };
  } catch (e) {
    return fail(e, "quoteStatus");
  }
}

export async function duplicateQuoteAction(id: string): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.quotesWrite);
    const r = await db.$transaction((tx) => duplicateQuote(tx, id, user.id));
    revalidate();
    return { ok: true, data: r, message: `Nueva versión creada: presupuesto N° ${r.number}` };
  } catch (e) {
    return fail(e, "duplicateQuote");
  }
}

export async function saveLeadAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.crmWrite);
    const input = leadSchema.parse(raw);
    const r = await db.$transaction((tx) => saveLead(tx, input, user.id));
    revalidate();
    return { ok: true, data: r, message: input.id ? "Oportunidad actualizada" : "Oportunidad creada" };
  } catch (e) {
    return fail(e, "saveLead");
  }
}

export async function setLeadStatusAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.crmWrite);
    const input = leadStatusSchema.parse(raw);
    const lead = await db.$transaction((tx) => setLeadStatus(tx, input.id, input.status, input.lostReason, user.id));
    revalidate();
    return { ok: true, data: undefined, message: `${lead.name}: ${LEAD_STATUS_LABELS[lead.status]}` };
  } catch (e) {
    return fail(e, "leadStatus");
  }
}

export async function convertLeadAction(leadId: string): Promise<ActionResult<{ clientId: string }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.crmWrite);
    const r = await db.$transaction((tx) => convertLeadToClient(tx, leadId, user.id));
    revalidate();
    return { ok: true, data: { clientId: r.clientId }, message: r.created ? "Cliente creado a partir de la oportunidad" : "La oportunidad ya tenía cliente" };
  } catch (e) {
    return fail(e, "convertLead");
  }
}

export async function addDesignAction(raw: unknown): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.crmWrite);
    const input = designSchema.parse(raw);
    await db.$transaction((tx) => addClientDesign(tx, input));
    revalidate();
    return { ok: true, data: undefined, message: `Diseño “${input.name}” agregado` };
  } catch (e) {
    return fail(e, "addDesign");
  }
}

export async function deleteDesignAction(id: string): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.crmWrite);
    await db.$transaction((tx) => deleteClientDesign(tx, id));
    revalidate();
    return { ok: true, data: undefined, message: "Diseño eliminado" };
  } catch (e) {
    return fail(e, "deleteDesign");
  }
}
