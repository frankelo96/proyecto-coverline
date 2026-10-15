import Decimal from "decimal.js";

import { finalUnitPrice } from "./sale-math";

/** Lista de precios lista para calcular: ajuste general y precios netos fijos por producto. */
export interface PriceListRule {
  id: string;
  name: string;
  adjustmentPct: number;
  /** productId → precio neto (sin IVA) */
  prices: Record<string, number>;
}

/** Precio neto de un producto según la lista (sin lista: el de lista minorista). */
export function listNetPrice(baseNet: number, productId: string, list: PriceListRule | null): number {
  if (!list) return baseNet;
  const fixed = list.prices[productId];
  if (fixed !== undefined && fixed > 0) return fixed;
  return new Decimal(baseNet).mul(new Decimal(100).plus(list.adjustmentPct)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** Precio final unitario (IVA incluido, con ajuste de talle) según la lista. */
export function listFinalPrice(baseNet: number, vatRate: number, sizeAdjustmentPct: number, productId: string, list: PriceListRule | null): number {
  return finalUnitPrice(listNetPrice(baseNet, productId, list), vatRate, sizeAdjustmentPct);
}
