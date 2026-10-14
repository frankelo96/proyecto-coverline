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

/**
 * Formas de llegar a la API. Algunos hostings y firewalls (Cloudflare,
 * Wordfence, ModSecurity, Imunify360) bloquean la cabecera Authorization o la
 * ruta /wp-json; por eso, si la primera es bloqueada, se prueban las otras y se
 * recuerda la que funcionó.
 */
const STRATEGIES = [
  { key: "cabecera", label: "/wp-json con autenticación básica" },
  { key: "parametros", label: "/wp-json con las claves en la URL" },
  { key: "rest_route", label: "?rest_route= con las claves en la URL" },
] as const;
type Strategy = (typeof STRATEGIES)[number]["key"];
let preferred: Strategy | null = null;

export const wooAccessMode = () => STRATEGIES.find((s) => s.key === preferred)?.label ?? null;

function buildRequest(strategy: Strategy, path: string, query: Record<string, string | number>) {
  const cfg = wooConfig();
  const clean = path.replace(/^\//, "");
  const url = strategy === "rest_route" ? new URL(`${cfg.url}/`) : new URL(`${cfg.url}/wp-json/wc/v3/${clean}`);
  if (strategy === "rest_route") url.searchParams.set("rest_route", `/wc/v3/${clean}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; CoverlineERP/1.0; sincronizacion de stock WooCommerce)",
  };
  if (strategy === "cabecera") headers.Authorization = `Basic ${Buffer.from(`${cfg.key}:${cfg.secret}`).toString("base64")}`;
  else {
    url.searchParams.set("consumer_key", cfg.key);
    url.searchParams.set("consumer_secret", cfg.secret);
  }
  return { url, headers };
}

/** Pista de quién bloqueó el pedido, a partir de la respuesta. */
function blockerHint(res: Response, text: string) {
  const body = text.toLowerCase();
  if (body.includes("country") || body.includes("país") || body.includes("pais no"))
    return "un bloqueo por país: el sitio solo acepta visitas desde ciertos países y el servidor del sistema (Render) está fuera de Argentina. Agregá las IP de salida de Render a la lista permitida del bloqueo por país (Render → coverline-erp → Connect → Outbound), o permití la ruta /wp-json/wc/";
  if (res.headers.get("cf-ray") || res.headers.get("server")?.toLowerCase().includes("cloudflare") || body.includes("cloudflare"))
    return "Cloudflare (en Cloudflare → Seguridad → WAF, creá una regla que permita la ruta /wp-json/wc/ o desactivá «Bot Fight Mode»)";
  if (body.includes("wordfence")) return "el plugin Wordfence (en Wordfence → Firewall, permití la ruta /wp-json/wc/ o poné el firewall en «Learning mode» un rato)";
  if (body.includes("imunify")) return "Imunify360 del hosting (pedí al hosting que permita la API REST de WooCommerce)";
  if (body.includes("sucuri")) return "el firewall de Sucuri (permití la ruta /wp-json/wc/)";
  if (body.includes("mod_security") || body.includes("modsecurity") || res.status === 406) return "ModSecurity del hosting (pedí al hosting que desactive la regla para /wp-json/wc/)";
  if (body.includes("ithemes") || body.includes("solid security")) return "el plugin Solid Security / iThemes (habilitá la API REST para usuarios con clave)";
  return "un firewall o plugin de seguridad del sitio, o el hosting";
}

const snippet = (text: string) =>
  text
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

type Attempt = { ok: true; json: unknown; res: Response } | { ok: false; blocked: boolean; error: WooError };

async function attempt(strategy: Strategy, path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number> }): Promise<Attempt> {
  const { url, headers } = buildRequest(strategy, path, init.query ?? {});
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, blocked: false, error: new WooError(`No se pudo conectar con la tienda (${e instanceof Error ? e.message : "error de red"})`) };
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Respuesta HTML o texto: lo cortó algo antes de llegar a WooCommerce.
    const extra = snippet(text);
    return {
      ok: false,
      blocked: true,
      error: new WooError(`La tienda bloqueó el pedido (HTTP ${res.status}) antes de llegar a WooCommerce. Lo bloquea ${blockerHint(res, text)}.${extra ? ` Respuesta: «${extra}»` : ""}`, res.status),
    };
  }
  if (!res.ok) {
    const j = json as { code?: string; message?: string } | null;
    const msg = j?.message ?? `HTTP ${res.status}`;
    if (res.status === 404 && j?.code === "rest_no_route") return { ok: false, blocked: true, error: new WooError("La tienda no tiene la API de WooCommerce habilitada (rest_no_route). ¿WooCommerce está activo?", 404) };
    // 401: el hosting a veces borra la cabecera Authorization; se reintenta con las claves en la URL.
    if (res.status === 401 || res.status === 403)
      return { ok: false, blocked: res.status === 401, error: new WooError(`La tienda rechazó las claves de API: ${msg}. Revisá que estén bien copiadas y tengan permiso de Lectura/Escritura.`, res.status) };
    return { ok: false, blocked: false, error: new WooError(`Error de la tienda: ${msg}`, res.status) };
  }
  return { ok: true, json, res };
}

/** Llamada a la API REST de WooCommerce (v3) sobre HTTPS. */
export async function wooFetch<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number> } = {}): Promise<{ data: T; totalPages: number }> {
  const cfg = wooConfig();
  if (!cfg.configured) throw new WooError("La tienda web no está configurada (WOO_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET)");
  const order: Strategy[] = preferred ? [preferred, ...STRATEGIES.map((s) => s.key).filter((k) => k !== preferred)] : STRATEGIES.map((s) => s.key);
  let first: WooError | null = null;
  for (const strategy of order) {
    const r = await attempt(strategy, path, init);
    if (r.ok) {
      preferred = strategy;
      return { data: r.json as T, totalPages: Number(r.res.headers.get("x-wp-totalpages") ?? "1") || 1 };
    }
    first ??= r.error;
    // Solo se prueba otra forma si el pedido no llegó a procesarse (bloqueado o claves no recibidas).
    if (!r.blocked) throw r.error;
  }
  throw first!;
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
