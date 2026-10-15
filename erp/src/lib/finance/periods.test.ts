import { describe, expect, it } from "vitest";

import { bucketOf, monthBounds, shiftMonth, weekBuckets } from "./periods";

describe("períodos", () => {
  it("límites del mes en hora argentina", () => {
    const { from, to } = monthBounds("2026-12");
    expect(from.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
  it("corre meses entre años", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
  });
  it("semanas: lo vencido va a la primera y lo lejano queda afuera", () => {
    const b = weekBuckets("2026-10-15", 4);
    expect(b).toHaveLength(4);
    expect(b[0].label).toBe("15/10 al 21/10");
    expect(bucketOf(b, new Date("2026-09-01T12:00:00-03:00"))).toBe(0);
    expect(bucketOf(b, new Date("2026-10-23T12:00:00-03:00"))).toBe(1);
    expect(bucketOf(b, new Date("2026-12-23T12:00:00-03:00"))).toBeNull();
  });
});
