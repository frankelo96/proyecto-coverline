"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { disconnectBridge, regenerateBridgeToken, requestCatalog } from "@/server/woo/bridge";
import { wooAccessMode, WooError, wooFetch } from "@/server/woo/client";
import { wooConfig } from "@/server/woo/config";
import { importCatalog, runSync, type SyncSummary } from "@/server/woo/sync";

function fail(e: unknown, scope: string): ActionResult<never> {
  if (e instanceof WooError || e instanceof AuthorizationError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  console.error(`[woo.actions] ${scope}`, e);
  return { ok: false, error: "No se pudo completar la operación" };
}

export async function testWooConnectionAction(): Promise<ActionResult<{ store: string }>> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const { data } = await wooFetch<{ id: number }[]>("products", { query: { per_page: 1 } });
    const { url } = wooConfig();
    const mode = wooAccessMode();
    return {
      ok: true,
      data: { store: url },
      message: `Conexión correcta con ${url} (${data.length ? "hay productos" : "la tienda no tiene productos"}${mode && !mode.includes("básica") ? ` · acceso por ${mode}` : ""})`,
    };
  } catch (e) {
    return fail(e, "test");
  }
}

export async function importWooCatalogAction(): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const r = await importCatalog();
    revalidatePath("/maestros/tienda-web");
    return {
      ok: true,
      data: undefined,
      message: `${r.items} artículos de la tienda: ${r.linked} vinculados (${r.newlyLinked} nuevos), ${r.unlinked} sin vincular${r.removed ? `, ${r.removed} ya no existen` : ""}`,
    };
  } catch (e) {
    return fail(e, "import");
  }
}

export async function runWooSyncAction(force: boolean): Promise<ActionResult<SyncSummary>> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const s = await runSync("manual", { force });
    revalidatePath("/maestros/tienda-web");
    revalidatePath("/pos", "layout");
    const parts =
      s.mode === "activo"
        ? [`${s.push.sent} artículos actualizados en la web`, `${s.orders.deducted} pedidos descontados`, s.orders.restocked ? `${s.orders.restocked} cancelados devueltos al stock` : null]
        : [`Solo lectura: ${s.push.pending} artículos cambiarían en la web`, `${s.orders.seen} pedidos leídos (no se descontó nada)`];
    const errors = s.push.errors.length ? ` · ${s.push.errors.length} errores` : "";
    return { ok: true, data: s, message: parts.filter(Boolean).join(" · ") + errors };
  } catch (e) {
    return fail(e, "sync");
  }
}

const linkSchema = z.object({ linkId: z.string().min(1), variantSku: z.string().trim().max(80).nullable() });

/** Vincula a mano un artículo de la tienda con una variante del ERP (o lo desvincula). */
export async function linkWooItemAction(raw: unknown): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const input = linkSchema.parse(raw);
    let variantId: string | null = null;
    if (input.variantSku) {
      const v = await db.productVariant.findFirst({ where: { OR: [{ sku: { equals: input.variantSku, mode: "insensitive" } }, { barcode: input.variantSku }] }, select: { id: true } });
      if (!v) return { ok: false, error: `No existe la variante ${input.variantSku} en el ERP` };
      variantId = v.id;
    }
    await db.wooLink.update({ where: { id: input.linkId }, data: { variantId, linkedBy: variantId ? "MANUAL" : null, lastPushedQty: null } });
    revalidatePath("/maestros/tienda-web");
    return { ok: true, data: undefined, message: variantId ? "Vinculado" : "Desvinculado" };
  } catch (e) {
    return fail(e, "link");
  }
}

// ─── Conexión por plugin de WordPress ─────────────────────────────────────

/** Pide al plugin la lista de productos en su próxima llamada (en hasta 5 minutos). */
export async function requestWooCatalogAction(): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    await requestCatalog();
    return { ok: true, data: undefined, message: "Listo: el plugin manda la lista de productos en su próxima sincronización (hasta 5 minutos, o al tocar «Sincronizar ahora» en WordPress)." };
  } catch (e) {
    return fail(e, "catalog");
  }
}

/** Cambia la clave del plugin: el plugin instalado deja de funcionar hasta subir el nuevo. */
export async function regenerateBridgeTokenAction(): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    await regenerateBridgeToken();
    revalidatePath("/maestros/tienda-web");
    return { ok: true, data: undefined, message: "Clave cambiada. Descargá el plugin de nuevo y reemplazá el instalado en WordPress." };
  } catch (e) {
    return fail(e, "token");
  }
}

/** Deja de usar el plugin (vuelve a la conexión directa por API, si está configurada). */
export async function disconnectBridgeAction(): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    await disconnectBridge();
    revalidatePath("/maestros/tienda-web");
    return { ok: true, data: undefined, message: "Plugin desconectado. Desactivalo también en WordPress." };
  } catch (e) {
    return fail(e, "disconnect");
  }
}
