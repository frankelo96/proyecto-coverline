"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { SaleError } from "@/lib/pos/sale-math";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { savePriceList, savePriceListItems } from "@/server/services/price-lists.service";

const listSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(2, "Poné un nombre a la lista").max(60),
  adjustmentPct: z.number().finite().min(-90, "El ajuste no puede bajar más de 90%").max(500),
  notes: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .transform((s) => s || null),
  active: z.boolean(),
});

const itemsSchema = z.object({
  priceListId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), netPrice: z.number().finite().min(0).max(1e10).nullable() })).min(1, "No hay cambios").max(5000),
});

function toError(e: unknown): ActionResult<never> {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  if (e instanceof SaleError || e instanceof AuthorizationError) return { ok: false, error: e.message };
  console.error("[price-lists.actions]", e);
  return { ok: false, error: "No se pudo guardar la lista de precios" };
}

function revalidate() {
  revalidatePath("/maestros", "layout");
  revalidatePath("/pos", "layout");
  revalidatePath("/crm", "layout");
}

export async function savePriceListAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = listSchema.parse(raw);
    const saved = await db.$transaction((tx) => savePriceList(tx, input, user.id));
    revalidate();
    return { ok: true, data: { id: saved.id }, message: `Lista "${saved.name}" guardada` };
  } catch (e) {
    return toError(e);
  }
}

export async function savePriceListItemsAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = itemsSchema.parse(raw);
    const n = await db.$transaction((tx) => savePriceListItems(tx, input.priceListId, input.items, user.id), { timeout: 60_000 });
    revalidate();
    return { ok: true, data: undefined, message: `Precios guardados (${n})` };
  } catch (e) {
    return toError(e);
  }
}
