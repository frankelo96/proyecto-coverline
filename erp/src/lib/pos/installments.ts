import Decimal from "decimal.js";

/** Plan de cuotas: recargo sobre el total (financiación), lo cobra Coverline y va en la factura. */
export interface InstallmentPlan {
  installments: number;
  surchargePct: number;
}

export const DEFAULT_PLANS: InstallmentPlan[] = [
  { installments: 1, surchargePct: 0 },
  { installments: 3, surchargePct: 0 },
  { installments: 6, surchargePct: 0 },
];

/** Normaliza lo guardado: cuotas enteras únicas, recargo 0–200 %, ordenado. */
export function parsePlans(raw: unknown): InstallmentPlan[] {
  if (!Array.isArray(raw)) return DEFAULT_PLANS;
  const seen = new Set<number>();
  const out: InstallmentPlan[] = [];
  for (const p of raw) {
    const n = Number((p as InstallmentPlan)?.installments);
    const pct = Number((p as InstallmentPlan)?.surchargePct);
    if (!Number.isInteger(n) || n < 1 || n > 36 || seen.has(n) || !Number.isFinite(pct) || pct < 0 || pct > 200) continue;
    seen.add(n);
    out.push({ installments: n, surchargePct: Math.round(pct * 100) / 100 });
  }
  return out.length ? out.sort((a, b) => a.installments - b.installments) : DEFAULT_PLANS;
}

/**
 * Precio unitario de la línea de recargo para que, después del descuento general,
 * sume exactamente el % del total ya descontado.
 */
export function surchargeLinePrice(totalAfterDiscount: number, surchargePct: number, globalDiscountPct: number): number {
  if (surchargePct <= 0) return 0;
  const surcharge = new Decimal(totalAfterDiscount).mul(surchargePct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const factor = new Decimal(100).minus(globalDiscountPct).div(100);
  return factor.lte(0) ? 0 : surcharge.div(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export const surchargeLabel = (p: InstallmentPlan) => `Recargo financiación ${p.installments} cuotas (${String(p.surchargePct).replace(".", ",")}%)`;
