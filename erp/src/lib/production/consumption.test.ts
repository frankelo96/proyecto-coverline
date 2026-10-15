import { describe, expect, it } from "vitest";

import { cutBreakdown, formatSizeQuantities, materialFor, orderConsumption, parseSizeQuantities } from "./consumption";

const bom = [
  { rawMaterialId: "tela-azul", quantity: 1.2, wastePct: 10 },
  { rawMaterialId: "boton", quantity: 6, wastePct: 0 },
];

describe("consumo de materiales por variante", () => {
  it("sin reglas usa la ficha para todos los talles y colores", () => {
    const c = orderConsumption(bom, new Map(), [
      { size: "M", color: "Azul", fabric: null, quantity: 10 },
      { size: "XL", color: "Bordó", fabric: null, quantity: 5 },
    ]);
    expect(c.get("tela-azul")).toBeCloseTo(1.2 * 1.1 * 15, 4);
    expect(c.get("boton")).toBe(90);
  });

  it("usa la tela alternativa del color y el consumo del talle", () => {
    const rules = new Map([
      ["tela-azul", { sizeQuantities: { XL: 1.6 }, alternatives: [{ color: "bordó", fabric: null, rawMaterialId: "tela-bordo" }] }],
    ]);
    const c = orderConsumption(bom, rules, [
      { size: "M", color: "Azul", fabric: null, quantity: 10 },
      { size: "XL", color: "Bordó", fabric: null, quantity: 5 },
    ]);
    expect(c.get("tela-azul")).toBeCloseTo(1.2 * 1.1 * 10, 4);
    expect(c.get("tela-bordo")).toBeCloseTo(1.6 * 1.1 * 5, 4);
  });

  it("prefiere la alternativa más específica", () => {
    const rule = {
      alternatives: [
        { color: "Blanco", fabric: null, rawMaterialId: "a" },
        { color: "Blanco", fabric: "Piqué", rawMaterialId: "b" },
      ],
    };
    expect(materialFor(bom[0], rule, { color: "blanco", fabric: "piqué" })).toBe("b");
    expect(materialFor(bom[0], rule, { color: "Blanco", fabric: "Jersey" })).toBe("a");
    expect(materialFor(bom[0], rule, { color: "Gris", fabric: "Jersey" })).toBe("tela-azul");
  });

  it("lee y escribe el consumo por talle", () => {
    expect(parseSizeQuantities("xl=1,6; 4: 0.9")).toEqual({ XL: 1.6, "4": 0.9 });
    expect(typeof parseSizeQuantities("XL 1,6")).toBe("string");
    expect(formatSizeQuantities({ XL: 1.6 })).toBe("XL=1,6");
  });
});

describe("orden de corte", () => {
  it("desglosa por material y talle con merma, igual que el consumo total", () => {
    const bom = [{ rawMaterialId: "pique", quantity: 1, wastePct: 10 }];
    const rules = new Map([["pique", { sizeQuantities: { XL: 1.5 }, alternatives: [{ color: "Azul", fabric: null, rawMaterialId: "pique-azul" }] }]]);
    const items = [
      { size: "M", color: "Blanco", fabric: null, quantity: 10 },
      { size: "XL", color: "Blanco", fabric: null, quantity: 4 },
      { size: "M", color: "Azul", fabric: null, quantity: 2 },
    ];
    const cut = cutBreakdown(bom, rules, items);
    const blanco = cut.find((c) => c.rawMaterialId === "pique")!;
    expect(blanco.lines.map((l) => [l.size, l.perUnit, l.total])).toEqual([
      ["M", 1.1, 11],
      ["XL", 1.65, 6.6],
    ]);
    expect(blanco.total).toBe(17.6);
    expect(cut.find((c) => c.rawMaterialId === "pique-azul")!.total).toBe(2.2);
    const totals = orderConsumption(bom, rules, items);
    for (const c of cut) expect(c.total).toBeCloseTo(totals.get(c.rawMaterialId)!, 4);
  });
});
