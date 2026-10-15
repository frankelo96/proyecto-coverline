import { describe, expect, it } from "vitest";

import { matchStatement, parseAmount, parseDate, parseStatement, suggestCategory } from "./reconciliation";

describe("conciliación", () => {
  it("lee importes y fechas en formato argentino", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("-1234.56")).toBe(-1234.56);
    expect(parseAmount("$ (2.000,00)")).toBe(-2000);
    expect(parseAmount("150,00-")).toBe(-150);
    expect(parseDate("5/10/26")).toBe("2026-10-05");
    expect(parseDate("2026-10-15T10:00:00")).toBe("2026-10-15");
  });
  it("lee un extracto con débito y crédito separados", () => {
    const csv = "Banco Macro;;;\nFecha;Concepto;Débito;Crédito;Saldo\n01/10/2026;TRANSF RECIBIDA;;150.000,00;150.000,00\n02/10/2026;COMISION MANT CUENTA;3.500,00;;146.500,00\n";
    const { lines, error } = parseStatement(csv);
    expect(error).toBeNull();
    expect(lines.map((l) => [l.date, l.amount])).toEqual([
      ["2026-10-01", 150000],
      ["2026-10-02", -3500],
    ]);
  });
  it("empareja por importe y fecha cercana, una sola vez", () => {
    const lines = [
      { row: 2, date: "2026-10-01", description: "TRANSF", amount: 1000 },
      { row: 3, date: "2026-10-03", description: "TRANSF", amount: 1000 },
      { row: 4, date: "2026-10-03", description: "COMISION", amount: -50 },
    ];
    const movs = [
      { id: "a", date: "2026-10-02", amount: 1000, concept: "Venta" },
      { id: "b", date: "2026-10-03", amount: 1000, concept: "Cobranza" },
      { id: "c", date: "2026-09-01", amount: -50, concept: "viejo" },
    ];
    const r = matchStatement(lines, movs);
    expect(r.matches.map((m) => [m.line.row, m.movement.id])).toEqual([
      [2, "a"],
      [3, "b"],
    ]);
    expect(r.unmatchedLines.map((l) => l.row)).toEqual([4]);
    expect(r.unmatchedMovements.map((m) => m.id)).toEqual(["c"]);
  });
  it("sugiere la categoría de comisiones e impuestos", () => {
    const cats = [
      { id: "b", name: "Gastos bancarios y comisiones" },
      { id: "i", name: "Impuestos y tasas" },
    ];
    expect(suggestCategory("COMISION MANT CUENTA", cats)).toBe("b");
    expect(suggestCategory("Impuesto Ley 25.413 Débitos", cats)).toBe("i");
    expect(suggestCategory("TRANSF RECIBIDA", cats)).toBeNull();
  });
});
