import "server-only";

import { wooConfig } from "./config";

export class WooError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "WooError";
  }
}

export interface WooProduct {
  id: number;
  name: string;
  sku: string;
  type: string;
  status: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  variations: number[];
}

export interface WooVariation {
  id: number;
  sku: string;
  manage_stock: boolean | "parent";
  stock_quantity: number | null;
  attributes: { name: string; option: string }[];
}

export interface WooOrderLine {
  product_id: number;
  variation_id: number;
  sku: string;
  name: string;
  quantity: number;
}

export interface WooOrderData {
  id: number;
  number: string;
  status: string;
  date_created_gmt: string;
  date_modified_gmt: string;
  total: string;
  billing: { first_name: string; last_name: string; email: string };
  line_items: WooOrderLine[];
}

/** Llamada a la API REST de WooCommerce (v3) con autenticación básica sobre HTTPS. */
export async function wooFetch<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number> } = {}): Promise<{ data: T; totalPages: number }> {
  const cfg = wooConfig();
  if (!cfg.configured) throw new WooError("La tienda web no está configurada (WOO_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET)");
  const url = new URL(`${cfg.url}/wp-json/wc/v3/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, String(v));
  const auth = Buffer.from(`${cfg.key}:${cfg.secret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "CoverlineERP/1.0" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new WooError(`No se pudo conectar con la tienda (${e instanceof Error ? e.message : "error de red"})`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new WooError(`La tienda respondió algo que no es JSON (HTTP ${res.status}). ¿La URL es correcta y tiene WooCommerce?`, res.status);
  }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new WooError(`La tienda rechazó las claves de API: ${msg}. Revisá que tengan permiso de lectura/escritura.`, res.status);
    throw new WooError(`Error de la tienda: ${msg}`, res.status);
  }
  return { data: json as T, totalPages: Number(res.headers.get("x-wp-totalpages") ?? "1") || 1 };
}

/** Recorre todas las páginas de un listado. */
export async function wooFetchAll<T>(path: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 200; page++) {
    const { data, totalPages } = await wooFetch<T[]>(path, { query: { ...query, per_page: 100, page } });
    out.push(...data);
    if (page >= totalPages || data.length === 0) break;
  }
  return out;
}
