import { describe, expect, it } from "vitest";

import { ean13Bars, ean13CheckDigit, ean13Modules, isValidEan13, normalizeEan13 } from "./barcode";

describe("EAN-13", () => {
  it("calcula el dígito verificador", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("779123456789")).toBe(8);
    expect(ean13CheckDigit("200000000009")).toBe(1);
  });

  it("valida y normaliza UPC-A", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("REM-LS-001")).toBe(false);
    expect(normalizeEan13("036000291452")).toBe("0036000291452");
  });

  it("arma los 95 módulos con guardas", () => {
    const m = ean13Modules("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.startsWith("101")).toBe(true);
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.endsWith("101")).toBe(true);
    // Patrón conocido del primer dígito de datos (0 con paridad L para el prefijo 4: LGLLGG)
    expect(m.slice(3, 10)).toBe("0001101");
    expect(m.slice(10, 17)).toBe("0100111");
  });

  it("agrupa las barras contiguas", () => {
    const bars = ean13Bars("4006381333931");
    const dark = bars.reduce((a, b) => a + b.width, 0);
    expect(dark).toBe(ean13Modules("4006381333931").split("").filter((c) => c === "1").length);
    expect(bars[0]).toEqual({ x: 0, width: 1, guard: true });
  });
});
