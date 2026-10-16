"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";

const startSchema = z.object({
  name: z.string().trim().min(3, "Poné un nombre a la campaña (ej. Reposición escolar febrero)").max(120),
  channel: z.enum(["whatsapp", "email", "todos"]),
  subject: z.string().trim().max(200).nullable(),
  message: z.string().trim().min(10, "Escribí el mensaje").max(2000),
  filters: z.record(z.string(), z.unknown()).nullable(),
  /** Local cuyo WhatsApp envía la campaña; null = central */
  branchId: z.string().min(1).nullable().default(null),
  clientIds: z.array(z.string().min(1)).min(1, "No hay destinatarios").max(2000),
});

function toError(e: unknown): ActionResult<never> {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  if (e instanceof AuthorizationError) return { ok: false, error: e.message };
  console.error("[campaigns.actions]", e);
  return { ok: false, error: "No se pudo guardar la campaña" };
}

/** Guarda la campaña con sus destinatarios para registrar a quién se le envió. */
export async function startCampaignAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.crmWrite);
    const input = startSchema.parse(raw);
    // Quien tiene un local asignado envía siempre desde el WhatsApp de su local.
    const branchId = user.branchId ?? input.branchId;
    const c = await db.campaign.create({
      data: {
        name: input.name,
        channel: input.channel,
        subject: input.subject,
        message: input.message,
        filters: (input.filters ?? undefined) as never,
        branchId,
        createdById: user.id,
        contacts: { create: [...new Set(input.clientIds)].map((clientId) => ({ clientId })) },
      },
      select: { id: true },
    });
    revalidatePath("/crm", "layout");
    return { ok: true, data: c, message: `Campaña «${input.name}» guardada: ya podés enviar los mensajes` };
  } catch (e) {
    return toError(e);
  }
}

/** Marca que se abrió el WhatsApp o el email de un destinatario. */
export async function markCampaignSentAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.crmWrite);
    const input = z.object({ campaignId: z.string().min(1), clientId: z.string().min(1), channel: z.enum(["WHATSAPP", "EMAIL"]) }).parse(raw);
    await db.campaignContact.updateMany({
      where: { campaignId: input.campaignId, clientId: input.clientId, sentAt: null },
      data: { channel: input.channel, sentAt: new Date(), sentById: user.id },
    });
    return { ok: true, data: undefined };
  } catch (e) {
    return toError(e);
  }
}
