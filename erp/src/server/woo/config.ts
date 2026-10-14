import "server-only";

/**
 * Modos:
 *  - desactivado: no se conecta.
 *  - solo-lectura: trae productos y pedidos y muestra qué cambiaría, sin escribir nada en la tienda
 *    ni descontar stock del ERP. Sirve para revisar la vinculación antes de activar.
 *  - activo: descuenta del ERP los pedidos web y publica el stock en la tienda.
 */
export type WooMode = "desactivado" | "solo-lectura" | "activo";

export function wooConfig() {
  const url = (process.env.WOO_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.WOO_CONSUMER_KEY ?? "").trim();
  const secret = (process.env.WOO_CONSUMER_SECRET ?? "").trim();
  const rawMode = (process.env.WOO_SYNC_MODE ?? "solo-lectura").toLowerCase();
  const configured = !!(url && key && secret);
  const mode: WooMode = !configured ? "desactivado" : rawMode === "activo" ? "activo" : rawMode === "desactivado" ? "desactivado" : "solo-lectura";
  const safety = Number(process.env.WOO_SAFETY_STOCK ?? "2");
  const minutes = Number(process.env.WOO_SYNC_MINUTES ?? "5");
  return {
    url,
    key,
    secret,
    configured,
    mode,
    /** Unidades que se reservan: la web publica total − margen */
    safetyStock: Number.isFinite(safety) && safety >= 0 ? Math.floor(safety) : 2,
    /** Cada cuántos minutos se sincroniza automáticamente */
    intervalMinutes: Number.isFinite(minutes) && minutes >= 1 ? minutes : 5,
    /** Local del que se descuentan los pedidos web (por defecto, el principal) */
    ordersBranch: process.env.WOO_ORDERS_BRANCH?.trim() || null,
    /** Clave para disparar la sincronización desde un cron externo (/api/tienda-web/sync?token=…) */
    cronToken: process.env.WOO_CRON_TOKEN?.trim() || null,
  };
}

export type WooConfig = ReturnType<typeof wooConfig>;
