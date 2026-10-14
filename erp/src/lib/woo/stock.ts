/**
 * Reglas de sincronización con WooCommerce — puras y testeadas.
 */

/** Stock a publicar en la web: total de todos los locales menos el margen de seguridad, nunca negativo. */
export function webQuantity(totalStock: number, safetyMargin: number): number {
  if (!Number.isFinite(totalStock)) return 0;
  return Math.max(0, Math.floor(totalStock) - Math.max(0, Math.floor(safetyMargin)));
}

/**
 * Estados de pedido de WooCommerce que descuentan stock: pagado o en espera de
 * pago confirmado (transferencia). Pendiente de pago, cancelado, fallido y
 * reintegrado no descuentan (y si ya se había descontado, se devuelve).
 */
const DEDUCTING = new Set(["processing", "completed", "on-hold"]);
export const orderDeductsStock = (status: string) => DEDUCTING.has(status);

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de pago",
  processing: "Procesando",
  "on-hold": "En espera",
  completed: "Completado",
  cancelled: "Cancelado",
  refunded: "Reintegrado",
  failed: "Fallido",
  "checkout-draft": "Borrador",
};

/** Agrupa los cambios de stock por producto padre para usar los endpoints batch de WooCommerce. */
export function groupStockUpdates<T extends { wooProductId: number; wooVariationId: number; quantity: number }>(items: T[]) {
  const variations = new Map<number, { id: number; stock_quantity: number; manage_stock: true }[]>();
  const simple: { id: number; stock_quantity: number; manage_stock: true }[] = [];
  for (const i of items) {
    if (i.wooVariationId) {
      const list = variations.get(i.wooProductId) ?? [];
      list.push({ id: i.wooVariationId, stock_quantity: i.quantity, manage_stock: true });
      variations.set(i.wooProductId, list);
    } else simple.push({ id: i.wooProductId, stock_quantity: i.quantity, manage_stock: true });
  }
  return { variations, simple };
}

/** Divide en lotes (WooCommerce acepta hasta 100 elementos por pedido batch). */
export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** SKU comparable: sin espacios ni mayúsculas. */
export const normalizeSku = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
