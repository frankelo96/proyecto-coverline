"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/format";
import { STAGE_LABELS, WorkflowError } from "@/lib/production/workflow";
import {
  cancelSchema,
  closeCutSchema,
  closeQualitySchema,
  createOrderSchema,
  orderIdSchema,
  receiveSchema,
  sendSchema,
} from "@/lib/validations/production";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import * as production from "@/server/services/production.service";

function toError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Datos inválidos" };
  if (error instanceof WorkflowError || error instanceof AuthorizationError) return { ok: false, error: error.message };
  console.error("[production.actions]", error);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

function revalidateOrder(orderId: string) {
  revalidatePath("/produccion/ordenes");
  revalidatePath(`/produccion/ordenes/${orderId}`);
  revalidatePath("/produccion/talleres");
}

/** Envuelve una mutación: permiso + validación + transacción + revalidación. */
async function run<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], input: z.infer<S>, userId: string) => Promise<T>,
): Promise<{ input: z.infer<S>; result: T }> {
  const user = await requireActionUser(PERMISSIONS.productionWrite);
  const input = schema.parse(raw);
  const result = await db.$transaction((tx) => fn(tx, input, user.id));
  return { input, result };
}

export async function createOrderAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const { result } = await run(createOrderSchema, raw, (tx, input, userId) => production.createProductionOrder(tx, input, userId));
    revalidatePath("/produccion/ordenes");
    return { ok: true, data: result, message: `Orden #${result.number} creada` };
  } catch (e) {
    return toError(e);
  }
}

export async function startOrderAction(raw: unknown): Promise<ActionResult> {
  try {
    const { input, result } = await run(orderIdSchema, raw, (tx, i, userId) => production.startProductionOrder(tx, i.orderId, userId));
    revalidateOrder(input.orderId);
    revalidatePath("/produccion/fichas");
    const warning = result.shortages.length
      ? ` Atención, stock insuficiente: ${result.shortages.map((s) => `${s.name} (faltan ${formatNumber(s.required - s.available)})`).join(", ")}.`
      : "";
    return { ok: true, data: undefined, message: `Orden lanzada a corte. Materiales descontados del stock.${warning}` };
  } catch (e) {
    return toError(e);
  }
}

export async function closeCutAction(raw: unknown): Promise<ActionResult> {
  try {
    const { input } = await run(closeCutSchema, raw, (tx, i, userId) => production.closeCut(tx, i, userId));
    revalidateOrder(input.orderId);
    return { ok: true, data: undefined, message: `Corte cerrado: ${input.cutPieces} piezas listas para enviar a confección` };
  } catch (e) {
    return toError(e);
  }
}

export async function sendToWorkshopAction(raw: unknown): Promise<ActionResult<{ remitId: string; number: number }>> {
  try {
    const { input, result } = await run(sendSchema, raw, (tx, i, userId) => production.sendToWorkshop(tx, i, userId));
    revalidateOrder(input.orderId);
    return { ok: true, data: { remitId: result.id, number: result.number }, message: `Remito de envío #${result.number} generado` };
  } catch (e) {
    return toError(e);
  }
}

export async function receiveFromWorkshopAction(raw: unknown): Promise<ActionResult<{ remitId: string; number: number }>> {
  try {
    const { input, result } = await run(receiveSchema, raw, (tx, i, userId) => production.receiveFromWorkshop(tx, i, userId));
    revalidateOrder(input.orderId);
    const advanced = result.advancedTo ? ` La orden pasó a ${STAGE_LABELS[result.advancedTo]}.` : "";
    return {
      ok: true,
      data: { remitId: result.remit.id, number: result.remit.number },
      message: `Recepción #${result.remit.number} registrada.${advanced}`,
    };
  } catch (e) {
    return toError(e);
  }
}

export async function skipPersonalizationAction(raw: unknown): Promise<ActionResult> {
  try {
    const { input } = await run(orderIdSchema, raw, (tx, i, userId) => production.skipPersonalization(tx, i.orderId, userId));
    revalidateOrder(input.orderId);
    return { ok: true, data: undefined, message: "Personalización omitida: la orden pasó a calidad y planchado" };
  } catch (e) {
    return toError(e);
  }
}

export async function closeQualityAction(raw: unknown): Promise<ActionResult> {
  try {
    const { input, result } = await run(closeQualitySchema, raw, (tx, i, userId) => production.closeQuality(tx, i, userId));
    revalidateOrder(input.orderId);
    return { ok: true, data: undefined, message: `Orden completada: ${result.finished} prendas ingresaron al stock` };
  } catch (e) {
    return toError(e);
  }
}

export async function cancelOrderAction(raw: unknown): Promise<ActionResult> {
  try {
    const { input } = await run(cancelSchema, raw, (tx, i, userId) => production.cancelOrder(tx, i, userId));
    revalidateOrder(input.orderId);
    return { ok: true, data: undefined, message: "Orden cancelada" };
  } catch (e) {
    return toError(e);
  }
}
