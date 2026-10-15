import Decimal from "decimal.js";

import type { PricingMode } from "@/generated/prisma/enums";
import { priceFromCost } from "@/lib/costing/escandallo";

export type PriceRule = { mode: "PCT"; pct: number } | { mode: "COST" };

export interface PricedProduct {
  /** Precio de lista neto (sin IVA) actual */
  listPrice: number;
  vatRate: number;
  currentCost: number;
  pricingMode: PricingMode;
  pricingPct: number;
}

/**
 * Nuevo precio de lista: un % sobre el actual o el sugerido por costo (markup/margen de la
 * ficha). El redondeo se aplica sobre el precio final con IVA (lo que ve el cliente) y de
 * ahí se vuelve al neto. Devuelve null si no se puede calcular (sin costo o sin precio).
 */
export function newListPrice(p: PricedProduct, rule: PriceRule, roundTo: number): { net: number; final: number } | null {
  let net: Decimal;
  if (rule.mode === "PCT") {
    if (p.listPrice <= 0) return null;
    net = new Decimal(p.listPrice).mul(new Decimal(100).plus(rule.pct)).div(100);
  } else {
    if (p.currentCost <= 0) return null;
    net = priceFromCost(new Decimal(p.currentCost), p.pricingMode, new Decimal(p.pricingPct));
  }
  const factor = new Decimal(100).plus(p.vatRate).div(100);
  let final = net.mul(factor);
  if (roundTo > 0) final = final.div(roundTo).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(roundTo);
  const roundedNet = final.div(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { net: roundedNet.toNumber(), final: final.toDecimalPlaces(2).toNumber() };
}
