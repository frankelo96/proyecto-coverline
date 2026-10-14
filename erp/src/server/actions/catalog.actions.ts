"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { saveVariantsSchema } from "@/lib/validations/catalog";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CatalogError, saveVariants } from "@/server/services/catalog.service";

export async function saveVariantsAction(raw: unknown): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = saveVariantsSchema.parse(raw);
    const r = await db.$transaction((tx) => saveVariants(tx, input, user.id));
    revalidatePath("/maestros", "layout");
    revalidatePath("/pos", "layout");
    return { ok: true, data: r, message: `Variantes guardadas (${r.created} nuevas, ${r.updated} actualizadas)` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof CatalogError || e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[catalog.actions]", e);
    return { ok: false, error: "No se pudieron guardar los talles" };
  }
}
