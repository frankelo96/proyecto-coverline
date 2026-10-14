import { describe, expect, it } from "vitest";

import { monthSummary, periodLabel, periodOf, shiftPeriod } from "./payroll";

describe("sueldos", () => {
  it("descuenta los adelantos del sueldo y separa los extras", () => {
    const s = monthSummary(500_000, [
      { concept: "ADELANTO", amount: 100_000 },
      { concept: "SUELDO", amount: 250_000 },
      { concept: "PREMIO", amount: 30_000 },
    ]);
    expect(s).toEqual({ paidSalary: 350_000, paidExtras: 30_000, pending: 150_000, overpaid: 0 });
  });

  it("marca lo pagado de más sin saldo negativo", () => {
    expect(monthSummary(100, [{ concept: "ADELANTO", amount: 150 }])).toEqual({ paidSalary: 150, paidExtras: 0, pending: 0, overpaid: 50 });
  });

  it("maneja los meses", () => {
    expect(periodLabel("2026-10")).toBe("octubre 2026");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    // 1 de noviembre 01:00 UTC todavía es 31 de octubre en Argentina
    expect(periodOf(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
  });
});
