"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { saveVariantsSchema, stockTransferSchema } from "@/lib/validations/catalog";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CatalogError, saveVariants } from "@/server/services/catalog.service";
import { StockError, transferStock } from "@/server/services/stock.service";
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
    return { ok: true, data: { warnings: r.warnings }, message: `Transferidas ${r.units} unidades de ${r.from} a ${r.to}${r.warnings.length ? `. Atención: ${r.warnings.join("; ")}` : ""}` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof StockError || e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[catalog.actions] transfer", e);
    return { ok: false, error: "No se pudo registrar la transferencia" };
  }
}
