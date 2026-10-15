import { describe, expect, it } from "vitest";

import { listFinalPrice, listNetPrice } from "./price-lists";

const mayorista = { id: "l1", name: "Mayorista", adjustmentPct: -20, prices: { fijo: 5000 } };

describe("listas de precios", () => {
  it("sin lista usa el precio de lista", () => {
    expect(listNetPrice(10000, "p", null)).toBe(10000);
  });
  it("aplica el ajuste general", () => {
    expect(listNetPrice(10000, "p", mayorista)).toBe(8000);
    expect(listNetPrice(333.33, "p", { ...mayorista, adjustmentPct: 15 })).toBe(383.33);
  });
  it("el precio fijo por producto reemplaza al ajuste", () => {
    expect(listNetPrice(10000, "fijo", mayorista)).toBe(5000);
  });
  it("el precio final suma IVA y ajuste de talle", () => {
    // 8000 + 21% = 9680; talle +10% = 10648
    expect(listFinalPrice(10000, 21, 10, "p", mayorista)).toBe(10648);
  });
});
