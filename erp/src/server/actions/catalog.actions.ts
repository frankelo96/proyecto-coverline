"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { saveVariantsSchema, scanStockSchema, stockMinimumsSchema, stockTransferSchema } from "@/lib/validations/catalog";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CatalogError, saveVariants } from "@/server/services/catalog.service";
import { applyScannedStock, saveStockMinimums, StockError, transferStock } from "@/server/services/stock.service";
import { scheduleWebStockPush } from "@/server/woo/sync";

export async function saveVariantsAction(raw: unknown): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = saveVariantsSchema.parse(raw);
    const r = await db.$transaction((tx) => saveVariants(tx, input, user.id));
    revalidatePath("/maestros", "layout");
    revalidatePath("/pos", "layout");
    scheduleWebStockPush(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
    return { ok: true, data: r, message: `Variantes guardadas (${r.created} nuevas, ${r.updated} actualizadas)` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof CatalogError || e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[catalog.actions]", e);
    return { ok: false, error: "No se pudieron guardar los talles" };
  }
}

export async function transferStockAction(raw: unknown): Promise<ActionResult<{ warnings: string[] }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = stockTransferSchema.parse(raw);
    const r = await db.$transaction((tx) => transferStock(tx, input.fromBranchId, input.toBranchId, input.lines, user.id, input.notes));
    revalidatePath("/maestros", "layout");
    revalidatePath("/pos", "layout");
    // Mover entre locales y el mayorista cambia lo que se publica en la web.
    scheduleWebStockPush(input.lines.map((l) => l.variantId));
    return { ok: true, data: { warnings: r.warnings }, message: `Transferidas ${r.units} unidades de ${r.from} a ${r.to}${r.warnings.length ? `. Atención: ${r.warnings.join("; ")}` : ""}` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof StockError || e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[catalog.actions] transfer", e);
    return { ok: false, error: "No se pudo registrar la transferencia" };
  }
}

/** Ingreso, egreso, conteo o transferencia cargados con el lector de códigos de barras. */
export async function scanStockAction(raw: unknown): Promise<ActionResult<{ warnings: string[] }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = scanStockSchema.parse(raw);
    const r = await db.$transaction((tx) => applyScannedStock(tx, input, user.id), { timeout: 60_000 });
    revalidatePath("/maestros", "layout");
    revalidatePath("/pos", "layout");
    scheduleWebStockPush(r.variantIds);
    return { ok: true, data: { warnings: r.warnings }, message: `${r.message}${r.warnings.length ? `. Atención: ${r.warnings.join("; ")}` : ""}` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof StockError || e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[catalog.actions] scan", e);
    return { ok: false, error: "No se pudo registrar el movimiento" };
  }
}

/** Stock mínimo por local: lo que esté por debajo aparece en Reposición. */
export async function saveStockMinimumsAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = stockMinimumsSchema.parse(raw);
    const n = await db.$transaction((tx) => saveStockMinimums(tx, input.items, user.id), { timeout: 60_000 });
    revalidatePath("/maestros", "layout");
    return { ok: true, data: undefined, message: `Mínimos guardados (${n})` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[catalog.actions] minimums", e);
    return { ok: false, error: "No se pudieron guardar los mínimos" };
  }
}
