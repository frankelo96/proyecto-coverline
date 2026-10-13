import { describe, expect, it } from "vitest";

import { computeQuoteTotals, effectiveQuoteStatus, fillTemplate, QuoteError } from "./quote-math";

describe("computeQuoteTotals", () => {
  it("discrimina IVA por alícuota sobre el neto bonificado", () => {
    const t = computeQuoteTotals([
      { quantity: 120, unitPrice: 15_000, discountPct: 10, vatRate: 21 },
      { quantity: 3, unitPrice: 1_000.5, discountPct: 0, vatRate: 10.5 },
    ]);
    expect(t.lines[0]).toEqual({ gross: 1_800_000, discount: 180_000, net: 1_620_000, vat: 340_200, total: 1_960_200 });
    expect(t.lines[1].net).toBe(3001.5);
    expect(t.lines[1].vat).toBe(315.16);
    expect(t.subtotal).toBe(1_623_001.5);
    expect(t.taxTotal).toBe(340_515.16);
    expect(t.total).toBe(1_963_516.66);
    expect(t.vatByRate).toEqual([
      { rate: 21, base: 1_620_000, vat: 340_200 },
      { rate: 10.5, base: 3001.5, vat: 315.16 },
    ]);
  });

  it("rechaza presupuestos vacíos o cantidades inválidas", () => {
    expect(() => computeQuoteTotals([])).toThrow(QuoteError);
    expect(() => computeQuoteTotals([{ quantity: 0, unitPrice: 1, discountPct: 0, vatRate: 21 }])).toThrow(QuoteError);
    expect(() => computeQuoteTotals([{ quantity: 1, unitPrice: 1, discountPct: 120, vatRate: 21 }])).toThrow(QuoteError);
  });
});

describe("effectiveQuoteStatus", () => {
  const now = new Date(2026, 9, 13, 15);
  it("vence enviados y borradores pasada la fecha de validez", () => {
    expect(effectiveQuoteStatus("ENVIADO", new Date(2026, 9, 12), now)).toBe("VENCIDO");
    expect(effectiveQuoteStatus("ENVIADO", new Date(2026, 9, 13), now)).toBe("ENVIADO");
    expect(effectiveQuoteStatus("ACEPTADO", new Date(2026, 0, 1), now)).toBe("ACEPTADO");
  });
});

describe("fillTemplate", () => {
  it("reemplaza variables conocidas y deja las desconocidas", () => {
    expect(fillTemplate("Hola {nombre}, {otra}", { nombre: "Ana" })).toBe("Hola Ana, {otra}");
  });
});
