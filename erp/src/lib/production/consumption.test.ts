import { describe, expect, it } from "vitest";

import { formatSizeQuantities, materialFor, orderConsumption, parseSizeQuantities } from "./consumption";

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
