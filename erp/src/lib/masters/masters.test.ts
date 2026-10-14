import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "./csv";
import { ENTITIES } from "./definitions";
import { formatCuit, isValidCuit, mapHeaders, parseField, parseLocaleNumber, parseValues, whatsappNumber } from "./fields";

describe("parseLocaleNumber", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,5", 1234.5],
    ["1,234.56", 1234.56],
    ["12.500.000", 12_500_000],
    ["1.5", 1.5],
    ["$ 2.500", 2500],
    ["-3,5", -3.5],
    ["15%", 15],
    [42, 42],
  ])("%s → %s", (raw, expected) => expect(parseLocaleNumber(raw)).toBe(expected));

  it("devuelve null para texto no numérico", () => {
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber("")).toBeNull();
  });
});

describe("CUIT", () => {
  it("valida el dígito verificador y formatea", () => {
    expect(isValidCuit("30-70000000-8")).toBe(true);
    expect(isValidCuit("30700000007")).toBe(false);
    expect(isValidCuit("20-12345678")).toBe(false);
    expect(formatCuit("30700000008")).toBe("30-70000000-8");
  });
});

describe("whatsappNumber", () => {
  it("normaliza celulares argentinos", () => {
    expect(whatsappNumber("351 15-555-1234")).toBe("5493515551234");
    expect(whatsappNumber("+54 9 351 555 1234")).toBe("5493515551234");
    expect(whatsappNumber("0351 555-1234")).toBe("5493515551234");
    expect(whatsappNumber("11 2345-6789")).toBe("5491123456789");
    expect(whatsappNumber("1234")).toBeNull();
  });
});

describe("parseField", () => {
  const fields = ENTITIES.clientes.fields;
  const f = (k: string) => fields.find((x) => x.key === k)!;

  it("acepta opciones por etiqueta, valor o alias sin importar acentos", () => {
    expect(parseField(f("type"), "escuela / COLEGIO")).toEqual({ ok: true, value: "ESCUELA" });
    expect(parseField(f("taxCondition"), "RI")).toEqual({ ok: true, value: "RESPONSABLE_INSCRIPTO" });
    expect(parseField(f("taxCondition"), "consumidor final")).toEqual({ ok: true, value: "CONSUMIDOR_FINAL" });
    expect(parseField(f("type"), "marciano").ok).toBe(false);
  });

  it("interpreta meses, etiquetas y booleanos", () => {
    expect(parseField(f("purchaseMonths"), "Marzo, feb; 12")).toEqual({ ok: true, value: [2, 3, 12] });
    expect(parseField(f("tags"), "Colegio, Reposición anual")).toEqual({ ok: true, value: ["colegio", "reposición-anual"] });
    expect(parseField(f("active"), "no")).toEqual({ ok: true, value: false });
    expect(parseField(f("active"), "")).toEqual({ ok: true, value: true });
  });

  it("marca obligatorios y emails inválidos", () => {
    const r = parseValues(fields, { businessName: "", email: "x@" });
    expect(r.ok).toBe(false);
    expect(r.errors.businessName).toMatch(/obligatorio/);
    expect(r.errors.email).toMatch(/email/);
  });
});

describe("mapHeaders", () => {
  it("reconoce encabezados por etiqueta o alias e informa faltantes", () => {
    const { mapping, missingRequired, ignored } = mapHeaders(["Razón Social*", "CUIT", "Mail", "Columna rara"], ENTITIES.clientes.fields);
    expect([...mapping.values()].map((f) => f.key)).toEqual(["businessName", "documentNumber", "email"]);
    expect(missingRequired).toEqual(["Tipo de cliente"]);
    expect(ignored).toEqual(["Columna rara"]);
  });
});

describe("CSV", () => {
  it("lee punto y coma, comillas y saltos de línea", () => {
    const rows = parseCsv('﻿Nombre;Notas\r\n"Pérez; Juan";"línea 1\nlínea ""2"""\r\nAna;\r\n');
    expect(rows).toEqual([
      ["Nombre", "Notas"],
      ["Pérez; Juan", 'línea 1\nlínea "2"'],
      ["Ana", ""],
    ]);
  });

  it("ida y vuelta", () => {
    const csv = toCsv([["a", "b"], [1.5, 'x"y']]);
    expect(parseCsv(csv)).toEqual([["a", "b"], ["1,5", 'x"y']]);
  });
});

describe("parseDateValue", () => {
  it("acepta formatos argentinos, ISO y fechas de Excel", async () => {
    const { parseDateValue } = await import("./fields");
    expect(parseDateValue("31/12/2025")).toBe("2025-12-31");
    expect(parseDateValue("5-3-26")).toBe("2026-03-05");
    expect(parseDateValue("2026-02-28")).toBe("2026-02-28");
    expect(parseDateValue(46022)).toBe("2025-12-31");
    expect(parseDateValue("30/02/2026")).toBeNull();
    expect(parseDateValue("hola")).toBeNull();
  });
});
