import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { chunk, groupStockUpdates, normalizeSku, orderDeductsStock, webQuantity } from "@/lib/woo/stock";
import { db } from "@/server/db";
import { adjustBranchStock, mainBranchId, webOrderBranchId, webStockByVariant } from "@/server/services/stock.service";

import { type WooOrderData, type WooProduct, type WooVariation, WooError, wooFetch, wooFetchAll } from "./client";
import { wooConfig, type WooMode } from "./config";

type Tx = Prisma.TransactionClient;

export interface SyncSummary {
  mode: WooMode;
  catalog?: { items: number; linked: number; newlyLinked: number; unlinked: number; removed: number };
  orders: { seen: number; deducted: number; restocked: number; baseline: number; unmatchedLines: string[] };
  push: { pending: number; sent: number; errors: string[]; preview: { sku: string; name: string; total: number; web: number; before: number | null }[] };
}

// ─── Catálogo ─────────────────────────────────────────────────────────────

/**
 * Trae productos y variaciones de la tienda y los vincula con las variantes
 * del ERP por SKU (o por código de barras). Los vínculos manuales se respetan.
 */
export async function importCatalog() {
  const products = await wooFetchAll<WooProduct>("products");
  const items: CatalogItem[] = [];
  for (const p of products) {
    if (p.type === "variable" && p.variations.length) {
      const variations = await wooFetchAll<WooVariation>(`products/${p.id}/variations`);
      for (const v of variations) {
        const attrs = v.attributes.map((a) => a.option).join(" / ");
        items.push({ productId: p.id, variationId: v.id, sku: v.sku, name: `${p.name}${attrs ? ` — ${attrs}` : ""}` });
      }
    } else items.push({ productId: p.id, variationId: 0, sku: p.sku, name: p.name });
  }
  return linkCatalog(items);
}

export interface CatalogItem {
  productId: number;
  variationId: number;
  sku: string;
  name: string;
  /** Stock que tiene hoy la tienda (null si no lo controla); lo informa el plugin */
  stock?: number | null;
  /** Código de barras (GTIN/EAN) cargado en la tienda; también sirve para vincular */
  gtin?: string;
}

/** Guarda los artículos de la tienda y los vincula por SKU (los vínculos manuales se respetan). */
export async function linkCatalog(items: CatalogItem[]) {
  const variants = await db.productVariant.findMany({ select: { id: true, sku: true, barcode: true } });
  const bySku = new Map<string, string>();
  for (const v of variants) {
    bySku.set(normalizeSku(v.sku), v.id);
    if (v.barcode) bySku.set(normalizeSku(v.barcode), v.id);
  }

  let newlyLinked = 0;
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(`${it.productId}:${it.variationId}`);
    const existing = await db.wooLink.findUnique({ where: { wooProductId_wooVariationId: { wooProductId: it.productId, wooVariationId: it.variationId } } });
    const match = (it.sku ? bySku.get(normalizeSku(it.sku)) : undefined) ?? (it.gtin ? bySku.get(normalizeSku(it.gtin)) : undefined) ?? null;
    const keepManual = existing?.linkedBy === "MANUAL" && existing.variantId;
    const variantId = keepManual ? existing!.variantId : match;
    if (!existing?.variantId && variantId) newlyLinked++;
    await db.wooLink.upsert({
      where: { wooProductId_wooVariationId: { wooProductId: it.productId, wooVariationId: it.variationId } },
      update: {
        wooSku: it.sku || null,
        wooName: it.name,
        variantId,
        linkedBy: keepManual ? "MANUAL" : variantId ? "SKU" : null,
        ...(it.stock !== undefined ? { lastPushedQty: it.stock } : {}),
      },
      create: {
        wooProductId: it.productId,
        wooVariationId: it.variationId,
        wooSku: it.sku || null,
        wooName: it.name,
        variantId,
        linkedBy: variantId ? "SKU" : null,
        ...(it.stock !== undefined ? { lastPushedQty: it.stock } : {}),
      },
    });
  }
  // Productos borrados de la tienda.
  const all = await db.wooLink.findMany({ select: { id: true, wooProductId: true, wooVariationId: true } });
  const gone = all.filter((l) => !seen.has(`${l.wooProductId}:${l.wooVariationId}`)).map((l) => l.id);
  if (gone.length) await db.wooLink.deleteMany({ where: { id: { in: gone } } });

  const linked = await db.wooLink.count({ where: { variantId: { not: null } } });
  return { items: items.length, linked, newlyLinked, unlinked: items.length - linked, removed: gone.length };
}

// ─── Pedidos web → stock del ERP ──────────────────────────────────────────

/** Local fijo para los pedidos web (WOO_ORDERS_BRANCH) o null para elegirlo por artículo. */
async function fixedOrdersBranchId(tx: Tx) {
  const name = wooConfig().ordersBranch;
  const b = name ? await tx.branch.findFirst({ where: { name, active: true }, select: { id: true } }) : null;
  return b?.id ?? null;
}

interface StoredLine {
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  /** Local del que se descontó (para devolverlo ahí si se cancela). */
  branchId?: string;
}

async function resolveLines(order: WooOrderData): Promise<StoredLine[]> {
  const out: StoredLine[] = [];
  for (const li of order.line_items) {
    const link = await db.wooLink.findUnique({ where: { wooProductId_wooVariationId: { wooProductId: li.product_id, wooVariationId: li.variation_id ?? 0 } } });
    let variantId = link?.variantId ?? null;
    if (!variantId && li.sku) {
      const v = await db.productVariant.findFirst({ where: { OR: [{ sku: { equals: li.sku, mode: "insensitive" } }, { barcode: li.sku }] }, select: { id: true } });
      variantId = v?.id ?? null;
    }
    out.push({ variantId, sku: li.sku, name: li.name, quantity: li.quantity });
  }
  return out;
}

/** Descuenta cada artículo del local fijo o del local que más stock tiene de esa variante. */
async function deductLines(tx: Tx, lines: StoredLine[], fixedBranchId: string | null, orderRef: string): Promise<StoredLine[]> {
  const out: StoredLine[] = [];
  for (const l of lines) {
    if (!l.variantId || l.quantity <= 0) {
      out.push(l);
      continue;
    }
    const branchId = fixedBranchId ?? (await webOrderBranchId(tx, l.variantId));
    await adjustBranchStock(tx, l.variantId, branchId, -l.quantity, { reason: "WEB", refType: "WEB", refId: orderRef, notes: `Pedido web ${orderRef}` });
    out.push({ ...l, branchId });
  }
  return out;
}

/** Firma de los renglones (variante y cantidad) para detectar pedidos editados. */
function linesSignature(lines: StoredLine[]) {
  const totals = new Map<string, number>();
  for (const l of lines) if (l.variantId) totals.set(l.variantId, (totals.get(l.variantId) ?? 0) + l.quantity);
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([v, q]) => `${v}:${q}`)
    .join("|");
}

async function restockLines(tx: Tx, lines: StoredLine[], fallbackBranchId: string, orderRef: string) {
  for (const l of lines)
    if (l.variantId && l.quantity > 0)
      await adjustBranchStock(tx, l.variantId, l.branchId ?? fallbackBranchId, l.quantity, { reason: "WEB_DEVOLUCION", refType: "WEB", refId: orderRef, notes: `Pedido web ${orderRef}` });
}

/**
 * Lee los pedidos modificados desde la última sincronización. Los pagados
 * descuentan stock del local configurado; si después se cancelan o reintegran,
 * el stock vuelve. Cada pedido se descuenta una sola vez.
 *
 * Primera vez (sin pedidos registrados): se toman los últimos 30 días. Los
 * pedidos "completados" se registran sin descontar (ya salieron y el stock
 * contado no los incluye); los pagados pendientes de envío sí descuentan.
 */
export async function pullOrders(mode: WooMode, since: Date | null, summary: SyncSummary) {
  const baseline = (await db.wooOrder.count()) === 0;
  const from = baseline ? new Date(Date.now() - 30 * 86_400_000) : (since ?? new Date(Date.now() - 2 * 86_400_000));
  const orders = await wooFetchAll<WooOrderData>("orders", { modified_after: from.toISOString().slice(0, 19), orderby: "modified", order: "asc" });
  await processOrders(mode, orders, summary);
}

/** Aplica al stock del ERP los pedidos leídos de la tienda (por la API o enviados por el plugin). */
export async function processOrders(mode: WooMode, orders: WooOrderData[], summary: SyncSummary) {
  const baseline = (await db.wooOrder.count()) === 0;
  summary.orders.seen = orders.length;

  for (const o of orders) {
    const lines = await resolveLines(o);
    for (const l of lines) if (!l.variantId) summary.orders.unmatchedLines.push(`Pedido ${o.number}: ${l.name}${l.sku ? ` (SKU ${l.sku})` : " (sin SKU)"}`);
    if (mode !== "activo") continue;

    const shouldDeduct = orderDeductsStock(o.status);
    await db.$transaction(async (tx) => {
      // Un pedido a la vez: si llegan dos avisos del mismo pedido juntos, el segundo espera y ve lo que hizo el primero.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`woo-order:${o.id}`}))`;
      const existing = await tx.wooOrder.findUnique({ where: { wooOrderId: o.id } });
      const fixed = await fixedOrdersBranchId(tx);
      let branchId = existing?.branchId ?? fixed ?? (await mainBranchId(tx));
      let deducted = existing?.deducted ?? false;
      let storedLines = (existing?.lines as unknown as StoredLine[] | undefined) ?? lines;
      const isBaseline = existing?.baseline ?? (baseline && o.status === "completed");
      if (isBaseline) {
        if (!existing) summary.orders.baseline++;
      } else if (shouldDeduct && !deducted) {
        storedLines = await deductLines(tx, lines, fixed, String(o.number));
        branchId = storedLines.find((l) => l.branchId)?.branchId ?? branchId;
        deducted = true;
        summary.orders.deducted++;
      } else if (!shouldDeduct && deducted) {
        await restockLines(tx, storedLines, branchId, String(o.number));
        deducted = false;
        summary.orders.restocked++;
      } else if (shouldDeduct && deducted && linesSignature(storedLines) !== linesSignature(lines)) {
        // Pedido editado después de descontado (otro talle, otra cantidad): se devuelve lo anterior y se descuenta lo nuevo.
        await restockLines(tx, storedLines, branchId, String(o.number));
        storedLines = await deductLines(tx, lines, fixed, String(o.number));
        summary.orders.deducted++;
      }
      const data = {
        number: o.number,
        status: o.status,
        deducted,
        baseline: isBaseline,
        branchId,
        lines: storedLines as unknown as Prisma.InputJsonValue,
        total: new Prisma.Decimal(Number(o.total) || 0),
        customer: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ") || o.billing?.email || null,
        orderDate: new Date(`${o.date_created_gmt}Z`),
      };
      if (existing) await tx.wooOrder.update({ where: { id: existing.id }, data });
      else await tx.wooOrder.create({ data: { ...data, wooOrderId: o.id } });
    });
  }
}

// ─── Stock del ERP → tienda ───────────────────────────────────────────────

/**
 * Publica en la tienda el stock de los locales (sin el mayorista) menos el
 * margen de seguridad. Sin `variantIds` revisa todo; con `force` reenvía aunque no haya
 * cambiado (corrige ediciones hechas a mano en WooCommerce).
 */
export async function pushStock(mode: WooMode, summary: SyncSummary, opts: { variantIds?: string[]; force?: boolean } = {}) {
  const { safetyStock } = wooConfig();
  const links = await db.wooLink.findMany({
    where: { variantId: opts.variantIds ? { in: opts.variantIds } : { not: null } },
    include: { variant: { select: { sku: true } } },
  });
  const stock = await webStockByVariant(db, opts.variantIds);
  const dayAgo = Date.now() - 86_400_000;
  const pending = links
    .map((l) => ({ link: l, total: stock.get(l.variantId!) ?? 0, quantity: webQuantity(stock.get(l.variantId!) ?? 0, safetyStock) }))
    .filter((x) => opts.force || x.link.lastPushedQty !== x.quantity || !x.link.lastPushedAt || x.link.lastPushedAt.getTime() < dayAgo);
  summary.push.pending = pending.length;
  summary.push.preview = pending.slice(0, 300).map((x) => ({
    sku: x.link.variant!.sku,
    name: x.link.wooName,
    total: x.total,
    web: x.quantity,
    before: x.link.lastPushedQty,
  }));
  if (mode !== "activo" || pending.length === 0) return;

  const items = pending.map((x) => ({ wooProductId: x.link.wooProductId, wooVariationId: x.link.wooVariationId, quantity: x.quantity, linkId: x.link.id }));
  const { variations, simple } = groupStockUpdates(items);
  const markOk = async (ids: string[]) => {
    for (const i of items.filter((x) => ids.includes(x.linkId))) {
      await db.wooLink.update({ where: { id: i.linkId }, data: { lastPushedQty: i.quantity, lastPushedAt: new Date(), lastError: null } });
    }
    summary.push.sent += ids.length;
  };
  const markError = async (ids: string[], message: string) => {
    await db.wooLink.updateMany({ where: { id: { in: ids } }, data: { lastError: message.slice(0, 300) } });
    summary.push.errors.push(message);
  };

  for (const [productId, updates] of variations) {
    for (const part of chunk(updates)) {
      const ids = items.filter((i) => i.wooProductId === productId && part.some((u) => u.id === i.wooVariationId)).map((i) => i.linkId);
      try {
        await wooFetch(`products/${productId}/variations/batch`, { method: "POST", body: { update: part } });
        await markOk(ids);
      } catch (e) {
        await markError(ids, `Producto ${productId}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }
  for (const part of chunk(simple)) {
    const ids = items.filter((i) => i.wooVariationId === 0 && part.some((u) => u.id === i.wooProductId)).map((i) => i.linkId);
    try {
      await wooFetch("products/batch", { method: "POST", body: { update: part } });
      await markOk(ids);
    } catch (e) {
      await markError(ids, `Productos simples: ${e instanceof Error ? e.message : "error"}`);
    }
  }
}

// ─── Corrida completa ─────────────────────────────────────────────────────

let running: Promise<SyncSummary> | null = null;

let bridgeCache: { at: number; active: boolean } | null = null;
/** Si la tienda está conectada por el plugin, la conexión directa por API no se usa. */
export async function bridgeActive() {
  if (bridgeCache && Date.now() - bridgeCache.at < 30_000) return bridgeCache.active;
  const active = (await db.wooBridge.count()) > 0;
  bridgeCache = { at: Date.now(), active };
  return active;
}
export const forgetBridgeCache = () => {
  bridgeCache = null;
};

/**
 * Sincronización completa: pedidos nuevos → stock del ERP → stock publicado.
 * Una sola corrida a la vez (si ya hay una en curso, se espera esa).
 */
export function runSync(trigger: "manual" | "automatico" | "cron", opts: { importCatalog?: boolean; force?: boolean } = {}): Promise<SyncSummary> {
  running ??= (async () => {
    if (await bridgeActive()) throw new WooError("La tienda está conectada por el plugin de WordPress: se sincroniza sola desde la tienda cada 5 minutos.");
    const { mode } = wooConfig();
    const summary: SyncSummary = { mode, orders: { seen: 0, deducted: 0, restocked: 0, baseline: 0, unmatchedLines: [] }, push: { pending: 0, sent: 0, errors: [], preview: [] } };
    const run = await db.wooSyncRun.create({ data: { trigger, mode } });
    try {
      if (mode === "desactivado") throw new WooError("La sincronización está desactivada");
      const last = await db.wooSyncRun.findFirst({ where: { ok: true, mode: "activo", id: { not: run.id } }, orderBy: { startedAt: "desc" } });
      // Superposición de 1 hora para no perder pedidos modificados durante la corrida anterior.
      const since = last ? new Date(last.startedAt.getTime() - 3_600_000) : null;
      if (opts.importCatalog || (await db.wooLink.count()) === 0) summary.catalog = await importCatalog();
      await pullOrders(mode, since, summary);
      await pushStock(mode, summary, { force: opts.force });
      await db.wooSyncRun.update({ where: { id: run.id }, data: { ok: summary.push.errors.length === 0, finishedAt: new Date(), summary: summary as unknown as Prisma.InputJsonValue } });
      return summary;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      await db.wooSyncRun.update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), error: message, summary: summary as unknown as Prisma.InputJsonValue } });
      throw e;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// ─── Envío inmediato tras una venta ───────────────────────────────────────

const queued = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Después de una venta, devolución o ajuste: publica el stock de esas variantes
 * en unos segundos (agrupando varias operaciones seguidas). Si falla, la
 * sincronización periódica lo corrige.
 */
export function scheduleWebStockPush(variantIds: string[]) {
  if (wooConfig().mode !== "activo" || !wooConfig().configured || variantIds.length === 0) return;
  for (const id of variantIds) queued.add(id);
  timer ??= setTimeout(() => {
    const ids = [...queued];
    queued.clear();
    timer = null;
    const summary: SyncSummary = { mode: "activo", orders: { seen: 0, deducted: 0, restocked: 0, baseline: 0, unmatchedLines: [] }, push: { pending: 0, sent: 0, errors: [], preview: [] } };
    // Con el plugin no hay envío inmediato: el plugin lo levanta en su próxima llamada.
    bridgeActive()
      .then((viaPlugin) => (viaPlugin ? undefined : pushStock("activo", summary, { variantIds: ids })))
      .catch((e) => console.error("[woo] envío inmediato", e));
  }, 3000);
}

/** Sincronización automática periódica (se inicia una vez al arrancar el servidor). */
export function startWooScheduler() {
  const cfg = wooConfig();
  if (cfg.mode === "desactivado" || !cfg.configured) return;
  const g = globalThis as unknown as { __wooScheduler?: ReturnType<typeof setInterval> };
  if (g.__wooScheduler) return;
  g.__wooScheduler = setInterval(async () => {
    if (await bridgeActive().catch(() => false)) return;
    runSync("automatico").catch((e) => console.error("[woo] sincronización automática:", e instanceof Error ? e.message : e));
  }, cfg.intervalMinutes * 60_000);
  console.log(`[woo] sincronización automática cada ${cfg.intervalMinutes} min (modo ${cfg.mode})`);
}

/** Publica el stock de los artículos de una venta o devolución recién registrada. */
export async function scheduleWebStockPushForSale(saleId: string) {
  if (wooConfig().mode !== "activo" || !wooConfig().configured) return;
  const items = await db.saleItem.findMany({ where: { saleId, variantId: { not: null } }, select: { variantId: true } });
  scheduleWebStockPush(items.map((i) => i.variantId!));
}
