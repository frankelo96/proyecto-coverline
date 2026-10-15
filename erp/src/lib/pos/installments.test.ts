import { describe, expect, it } from "vitest";

import { computeSaleTotals } from "./sale-math";
import { parsePlans, surchargeLinePrice } from "./installments";

describe("cuotas con recargo", () => {
  it("normaliza los planes guardados", () => {
    expect(parsePlans([{ installments: 6, surchargePct: 25 }, { installments: 3, surchargePct: 12.5 }, { installments: 3, surchargePct: 99 }, { installments: 0, surchargePct: 1 }])).toEqual([
      { installments: 3, surchargePct: 12.5 },
      { installments: 6, surchargePct: 25 },
    ]);
    expect(parsePlans(null)[0].installments).toBe(1);
  });
  it("el recargo suma el % exacto aunque haya descuento general", () => {
    const items = [{ quantity: 2, unitPrice: 10000, discountPct: 0, vatRate: 21 }];
    const base = computeSaleTotals(items, 10); // 18000
    const price = surchargeLinePrice(base.total, 15, 10);
    const withSurcharge = computeSaleTotals([...items, { quantity: 1, unitPrice: price, discountPct: 0, vatRate: 21 }], 10);
    expect(withSurcharge.total).toBeCloseTo(18000 * 1.15, 1);
  });
});
