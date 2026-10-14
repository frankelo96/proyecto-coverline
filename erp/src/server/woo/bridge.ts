import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { webQuantity } from "@/lib/woo/stock";
import { db } from "@/server/db";
import { webStockByVariant } from "@/server/services/stock.service";

import type { WooOrderData } from "./client";
import { wooConfig } from "./config";
import { forgetBridgeCache, linkCatalog, processOrders, type SyncSummary } from "./sync";

/**
 * Conexión por plugin de WordPress: el plugin llama al ERP cada 5 minutos,
 * manda los pedidos (y cada tanto la lista de productos) y recibe el stock a
 * publicar. Como la conexión sale de la tienda, no la frenan los bloqueos por
 * país ni los firewalls del hosting.
 */

const CATALOG_EVERY_MS = 60 * 60_000;

export async function getOrCreateBridge() {
  const existing = await db.wooBridge.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const created = await db.wooBridge.create({ data: { id: "default", token: randomBytes(24).toString("hex") } });
  forgetBridgeCache();
  return created;
}

export async function regenerateBridgeToken() {
  await getOrCreateBridge();
  return db.wooBridge.update({ where: { id: "default" }, data: { token: randomBytes(24).toString("hex") } });
}

export async function disconnectBridge() {
  await db.wooBridge.deleteMany({});
  forgetBridgeCache();
}

export async function requestCatalog() {
  await db.wooBridge.update({ where: { id: "default" }, data: { catalogRequested: true } });
}

/** Verifica la clave que manda el plugin (comparación en tiempo constante). */
export async function bridgeFromToken(token: string | null) {
  if (!token) return null;
  const bridge = await db.wooBridge.findUnique({ where: { id: "default" } });
  if (!bridge) return null;
  const a = Buffer.from(bridge.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? bridge : null;
}

const int = z.coerce.number().int();
const lineSchema = z.object({
  product_id: int,
  variation_id: int.default(0),
  sku: z.string().default(""),
  name: z.string().default(""),
  quantity: z.coerce.number(),
});
const orderSchema = z.object({
  id: int,
  number: z.coerce.string(),
  status: z.string(),
  date_created_gmt: z.string(),
  date_modified_gmt: z.string().default(""),
  total: z.coerce.string().default("0"),
  billing: z.object({ first_name: z.string().default(""), last_name: z.string().default(""), email: z.string().default("") }).default({ first_name: "", last_name: "", email: "" }),
  line_items: z.array(lineSchema).default([]),
});

export const bridgeRequestSchema = z.object({
  version: z.string().max(20).default(""),
  site: z.string().max(300).default(""),
  catalog: z
    .array(z.object({ product_id: int, variation_id: int.default(0), sku: z.string().default(""), name: z.string().default(""), stock: z.number().nullable().default(null) }))
    .optional(),
  orders: z.array(orderSchema).default([]),
  applied: z.array(z.object({ product_id: int, variation_id: int.default(0), quantity: int, error: z.string().optional() })).default([]),
});
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;

export interface BridgeResponse {
  ok: true;
  mode: string;
  need_catalog: boolean;
  /** Stock a publicar (solo en modo activo y solo lo que cambió) */
  stock: { product_id: number; variation_id: number; quantity: number }[];
  message: string;
}

export async function bridgeSync(bridgeId: string, req: BridgeRequest): Promise<BridgeResponse> {
  const { mode, safetyStock } = wooConfig();
  await db.wooBridge.update({ where: { id: bridgeId }, data: { lastSeenAt: new Date(), pluginVersion: req.version || null, siteUrl: req.site || null } });
  if (mode === "desactivado") return { ok: true, mode, need_catalog: false, stock: [], message: "Sincronización desactivada en el ERP" };

  const summary: SyncSummary = { mode, orders: { seen: 0, deducted: 0, restocked: 0, baseline: 0, unmatchedLines: [] }, push: { pending: 0, sent: 0, errors: [], preview: [] } };
  const run = await db.wooSyncRun.create({ data: { trigger: "puente", mode } });
  try {
    // 1. Lo que el plugin publicó en la llamada anterior.
    const now = new Date();
    for (const a of req.applied) {
      const where = { wooProductId: a.product_id, wooVariationId: a.variation_id };
      if (a.error) {
        summary.push.errors.push(a.error);
        await db.wooLink.updateMany({ where, data: { lastError: a.error.slice(0, 300) } });
      } else {
        await db.wooLink.updateMany({ where, data: { lastPushedQty: a.quantity, lastPushedAt: now, lastError: null } });
        summary.push.sent++;
      }
    }

    // 2. Lista de productos (cada una hora o cuando se pide desde el ERP).
    if (req.catalog) {
      summary.catalog = await linkCatalog(
        req.catalog.map((c) => ({ productId: c.product_id, variationId: c.variation_id, sku: c.sku, name: c.name, stock: c.stock === null ? null : Math.floor(c.stock) })),
      );
      await db.wooBridge.update({ where: { id: bridgeId }, data: { lastCatalogAt: now, catalogRequested: false } });
    }

    // 3. Pedidos web → stock del ERP.
    await processOrders(mode, req.orders as unknown as WooOrderData[], summary);

    // 4. Stock a publicar: lo que difiere de lo que hoy tiene la tienda.
    const links = await db.wooLink.findMany({ where: { variantId: { not: null } }, include: { variant: { select: { sku: true } } } });
    const stock = await webStockByVariant(db);
    const pending = links
      .map((l) => ({ link: l, total: stock.get(l.variantId!) ?? 0, quantity: webQuantity(stock.get(l.variantId!) ?? 0, safetyStock) }))
      .filter((x) => x.link.lastPushedQty !== x.quantity);
    summary.push.pending = pending.length;
    summary.push.preview = pending.slice(0, 300).map((x) => ({ sku: x.link.variant!.sku, name: x.link.wooName, total: x.total, web: x.quantity, before: x.link.lastPushedQty }));

    const bridge = await db.wooBridge.findUniqueOrThrow({ where: { id: bridgeId } });
    const needCatalog = bridge.catalogRequested || !bridge.lastCatalogAt || now.getTime() - bridge.lastCatalogAt.getTime() > CATALOG_EVERY_MS;
    await db.wooSyncRun.update({
      where: { id: run.id },
      data: { ok: summary.push.errors.length === 0, finishedAt: new Date(), summary: summary as unknown as Prisma.InputJsonValue },
    });
    return {
      ok: true,
      mode,
      need_catalog: needCatalog,
      stock: mode === "activo" ? pending.map((x) => ({ product_id: x.link.wooProductId, variation_id: x.link.wooVariationId, quantity: x.quantity })) : [],
      message:
        mode === "activo"
          ? `${summary.orders.deducted} pedidos descontados, ${pending.length} artículos para actualizar`
          : `Modo prueba: ${pending.length} artículos cambiarían (no se escribe nada en la tienda)`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    await db.wooSyncRun.update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), error: message, summary: summary as unknown as Prisma.InputJsonValue } });
    throw e;
  }
}
