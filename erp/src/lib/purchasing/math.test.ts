import { describe, expect, it } from "vitest";

import {
  agingBucket,
  agingSummary,
  allocatePayment,
  computePurchaseTotals,
  convertToStockUnit,
  costChange,
  PurchasingError,
  purchasableUoms,
} from "./math";

describe("convertToStockUnit", () => {
  it("convierte compra en kg a stock en metros", () => {
    expect(convertToStockUnit({ purchasedUom: "KILOGRAMO", stockUom: "METRO", metersPerKg: 2.6, quantity: 25, unitCost: 17680 })).toEqual({
      stockQuantity: 65,
      stockUnitCost: 6800,
    });
  });

  it("deja igual si la unidad coincide", () => {
    expect(convertToStockUnit({ purchasedUom: "UNIDAD", stockUom: "UNIDAD", metersPerKg: null, quantity: 100, unitCost: 45 })).toEqual({
      stockQuantity: 100,
      stockUnitCost: 45,
    });
  });

  it("falla sin rendimiento", () => {
    expect(() => convertToStockUnit({ purchasedUom: "KILOGRAMO", stockUom: "METRO", metersPerKg: null, quantity: 1, unitCost: 1 })).toThrow(
      PurchasingError,
    );
    expect(purchasableUoms("METRO", null)).toEqual(["METRO"]);
    expect(purchasableUoms("METRO", 2.6)).toEqual(["METRO", "KILOGRAMO"]);
  });
});

describe("computePurchaseTotals", () => {
  const lines = [
    { quantity: 65, unitCost: 6800, vatRate: 21 },
    { quantity: 1000, unitCost: 45, vatRate: 10.5 },
  ];
  const extras = { perceptionIva: 1000, perceptionIibb: 500, otherTaxes: 0 };

  it("factura A discrimina IVA por alícuota", () => {
    const t = computePurchaseTotals(lines, extras, "FACTURA_A");
    expect(t.subtotal).toBe(442000 + 45000);
    expect(t.vat21).toBe(92820);
    expect(t.vat105).toBe(4725);
    expect(t.taxTotal).toBe(97545);
    expect(t.total).toBe(487000 + 97545 + 1500);
  });

  it("factura C no discrimina IVA", () => {
    const t = computePurchaseTotals(lines, { perceptionIva: 0, perceptionIibb: 0, otherTaxes: 0 }, "FACTURA_C");
    expect(t.taxTotal).toBe(0);
    expect(t.total).toBe(487000);
  });
});

describe("costChange", () => {
  it("detecta aumento", () => {
    expect(costChange(6800, 7480)).toEqual({ delta: 680, deltaPct: 10, increased: true });
    expect(costChange(0, 10).deltaPct).toBeNull();
  });
});

describe("allocatePayment", () => {
  const payables = [
    { id: "b", balance: 50000, dueDate: new Date("2026-11-10") },
    { id: "a", balance: 30000, dueDate: new Date("2026-10-01") },
  ];
  it("imputa por vencimiento más antiguo", () => {
    expect(allocatePayment(40000, payables)).toEqual([
      { payableId: "a", amount: 30000 },
      { payableId: "b", amount: 10000 },
    ]);
  });
  it("no permite pagar de más", () => {
    expect(() => allocatePayment(90000, payables)).toThrow(/supera/);
    expect(() => allocatePayment(0, payables)).toThrow(PurchasingError);
  });
});

describe("aging", () => {
  const today = new Date("2026-10-13T15:00:00");
  it("clasifica por días vencidos", () => {
    expect(agingBucket(new Date("2026-10-13"), today)).toBe("A_VENCER");
    expect(agingBucket(new Date("2026-10-12"), today)).toBe("D1_30");
    expect(agingBucket(new Date("2026-08-01"), today)).toBe("D61_90");
    expect(agingBucket(new Date("2026-05-01"), today)).toBe("D90_MAS");
  });
  it("suma saldos por tramo", () => {
    const s = agingSummary(
      [
        { balance: 100, dueDate: new Date("2026-11-01") },
        { balance: 50.5, dueDate: new Date("2026-10-01") },
        { balance: 20, dueDate: new Date("2026-10-05") },
      ],
      today,
    );
    expect(s).toEqual({ A_VENCER: 100, D1_30: 70.5, D31_60: 0, D61_90: 0, D90_MAS: 0 });
  });
});
