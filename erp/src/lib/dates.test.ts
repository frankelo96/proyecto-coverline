import { describe, expect, it } from "vitest";

import { isoLocalDate, isoLocalDateIn } from "./dates";

describe("fechas en hora argentina", () => {
  it("después de las 21 h sigue siendo el mismo día en Argentina", () => {
    expect(isoLocalDate(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    expect(isoLocalDate(new Date("2026-11-01T02:59:00Z"))).toBe("2026-10-31");
    expect(isoLocalDate(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11-01");
  });
  it("suma días", () => {
    expect(isoLocalDateIn(30, new Date("2026-10-15T15:00:00Z"))).toBe("2026-11-14");
  });
});
