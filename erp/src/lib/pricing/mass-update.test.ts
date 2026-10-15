import { describe, expect, it } from "vitest";

import { newListPrice } from "./mass-update";

const base = { listPrice: 10000, vatRate: 21, currentCost: 5000, pricingMode: "MARKUP" as const, pricingPct: 100 };

describe("actualización masiva de precios", () => {
  it("aumenta un porcentaje y redondea el final con IVA", () => {
    // 10000 + 15% = 11500 neto → 13915 final → redondeo a 100 = 13900 → neto 11487,60
    expect(newListPrice(base, { mode: "PCT", pct: 15 }, 100)).toEqual({ net: 11487.6, final: 13900 });
  });
  it("sin redondeo mantiene el neto exacto", () => {
    expect(newListPrice(base, { mode: "PCT", pct: 10 }, 0)).toEqual({ net: 11000, final: 13310 });
  });
  it("precio sugerido por costo (markup o margen)", () => {
    expect(newListPrice(base, { mode: "COST" }, 0)?.net).toBe(10000);
    expect(newListPrice({ ...base, pricingMode: "MARGIN", pricingPct: 50 }, { mode: "COST" }, 0)?.net).toBe(10000);
  });
  it("sin costo o sin precio no calcula", () => {
    expect(newListPrice({ ...base, currentCost: 0 }, { mode: "COST" }, 0)).toBeNull();
    expect(newListPrice({ ...base, listPrice: 0 }, { mode: "PCT", pct: 10 }, 0)).toBeNull();
  });
});
