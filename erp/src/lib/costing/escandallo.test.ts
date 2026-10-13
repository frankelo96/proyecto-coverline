import { describe, expect, it } from "vitest";

import {
  applyMaterialPriceShock,
  computeCostSheet,
  CostingError,
  type CostSheetInput,
} from "./escandallo";

const chomba: CostSheetInput = {
  materials: [
    { name: "Piqué 24/1", type: "TELA", uom: "METRO", quantity: 1.2, wastePct: 5, unitCost: 6800 },
    { name: "Reeb", type: "TELA", uom: "METRO", quantity: 0.1, wastePct: 5, unitCost: 5200 },
    { name: "Botón 4 agujeros", type: "AVIO", uom: "UNIDAD", quantity: 3, wastePct: 0, unitCost: 45 },
    { name: "Bolsa PP", type: "EMPAQUE", uom: "UNIDAD", quantity: 1, wastePct: 0, unitCost: 60 },
  ],
  services: [
    { name: "Corte", type: "CORTE", quantity: 1, unitCost: 350 },
    { name: "Confección", type: "CONFECCION", quantity: 1, unitCost: 2200 },
    { name: "Bordado", type: "BORDADO", quantity: 1, unitCost: 900 },
    { name: "Flete taller", type: "FLETE", quantity: 1, unitCost: 150 },
  ],
  overheadPct: 0,
  pricingMode: "MARKUP",
  pricingPct: 100,
  vatRate: 21,
};

describe("computeCostSheet", () => {
  it("calcula consumo bruto con merma y subtotales por línea", () => {
    const r = computeCostSheet(chomba);
    // 1.2 m × 1.05 = 1.26 m × 6800 = 8568
    expect(r.materials[0]).toMatchObject({ grossQuantity: 1.26, subtotal: 8568 });
    // 0.1 × 1.05 × 5200 = 546
    expect(r.materials[1].subtotal).toBe(546);
    expect(r.materialsCost).toBe(8568 + 546 + 135 + 60);
    expect(r.servicesCost).toBe(3600);
    expect(r.totalCost).toBe(9309 + 3600);
  });

  it("agrupa por rubro y las participaciones suman 100%", () => {
    const r = computeCostSheet(chomba);
    const byGroup = Object.fromEntries(r.groups.map((g) => [g.group, g.amount]));
    expect(byGroup.TELAS).toBe(9114);
    expect(byGroup.PERSONALIZACION).toBe(900);
    expect(byGroup.PLANCHADO_EMPAQUE).toBe(60);
    const totalShare = r.groups.reduce((a, g) => a + g.sharePct, 0);
    expect(totalShare).toBeCloseTo(100, 1);
  });

  it("aplica gastos generales sobre el costo directo", () => {
    const r = computeCostSheet({ ...chomba, overheadPct: 10 });
    expect(r.overheadCost).toBe(1290.9);
    expect(r.totalCost).toBe(14199.9);
  });

  it("precio por markup y por margen", () => {
    const markup = computeCostSheet(chomba);
    expect(markup.suggestedNetPrice).toBe(25818);
    expect(markup.suggestedFinalPrice).toBe(31239.78);
    expect(markup.effectiveMarginPct).toBe(50);

    const margin = computeCostSheet({ ...chomba, pricingMode: "MARGIN", pricingPct: 40 });
    // 12909 / 0.6 = 21515
    expect(margin.suggestedNetPrice).toBe(21515);
    expect(margin.effectiveMarginPct).toBe(40);
  });

  it("redondea el precio final hacia arriba y recalcula el neto", () => {
    const r = computeCostSheet({ ...chomba, priceRoundingStep: 500 });
    expect(r.suggestedFinalPrice).toBe(31500);
    expect(r.suggestedNetPrice).toBe(26033.06);
    expect(r.suggestedVat).toBe(5466.94);
  });

  it("evalúa el precio de lista y el aumento contra la ficha vigente", () => {
    const r = computeCostSheet({ ...chomba, listPrice: 12000, baselineCost: 12000 });
    expect(r.listPriceCheck).toMatchObject({ belowCost: true });
    expect(r.baselineCheck).toMatchObject({ delta: 909, increased: true, deltaPct: 7.58 });
  });

  it("rechaza valores negativos y margen >= 100%", () => {
    expect(() =>
      computeCostSheet({ ...chomba, services: [{ name: "X", type: "OTRO", quantity: -1, unitCost: 1 }] }),
    ).toThrow(CostingError);
    expect(() => computeCostSheet({ ...chomba, pricingMode: "MARGIN", pricingPct: 100 })).toThrow(CostingError);
  });

  it("no pierde precisión con decimales", () => {
    const r = computeCostSheet({
      ...chomba,
      materials: [{ name: "Hilo", type: "AVIO", uom: "CONO", quantity: 0.1, wastePct: 0, unitCost: 0.2 }],
      services: [],
    });
    expect(r.totalCost).toBe(0.02);
  });
});

describe("applyMaterialPriceShock", () => {
  it("ajusta solo las telas", () => {
    const shocked = applyMaterialPriceShock(chomba.materials, 10, (l) => l.type === "TELA");
    expect(shocked[0].unitCost).toBe(7480);
    expect(shocked[2].unitCost).toBe(45);
  });
});
