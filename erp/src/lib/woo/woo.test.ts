import { describe, expect, it } from "vitest";

import { chunk, groupStockUpdates, normalizeSku, orderDeductsStock, webQuantity } from "./stock";

describe("webQuantity", () => {
  it("publica el total menos el margen, sin negativos ni decimales", () => {
    expect(webQuantity(10, 2)).toBe(8);
    expect(webQuantity(2, 2)).toBe(0);
    expect(webQuantity(1, 2)).toBe(0);
    expect(webQuantity(-5, 2)).toBe(0);
    expect(webQuantity(7.9, 0)).toBe(7);
  });
});

describe("pedidos", () => {
  it("descuentan solo los pagados o en espera", () => {
    expect(orderDeductsStock("processing")).toBe(true);
    expect(orderDeductsStock("completed")).toBe(true);
    expect(orderDeductsStock("on-hold")).toBe(true);
    expect(orderDeductsStock("pending")).toBe(false);
    expect(orderDeductsStock("cancelled")).toBe(false);
    expect(orderDeductsStock("refunded")).toBe(false);
  });
});

describe("lotes", () => {
  it("agrupa variaciones por producto y separa los simples", () => {
    const g = groupStockUpdates([
      { wooProductId: 10, wooVariationId: 11, quantity: 3 },
      { wooProductId: 10, wooVariationId: 12, quantity: 0 },
      { wooProductId: 20, wooVariationId: 0, quantity: 5 },
    ]);
    expect(g.variations.get(10)).toEqual([
      { id: 11, stock_quantity: 3, manage_stock: true },
      { id: 12, stock_quantity: 0, manage_stock: true },
    ]);
    expect(g.simple).toEqual([{ id: 20, stock_quantity: 5, manage_stock: true }]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(normalizeSku(" rem-ls 001 ")).toBe("REM-LS001");
  });
});
