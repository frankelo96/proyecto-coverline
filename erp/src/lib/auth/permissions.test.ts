import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions";

describe("hasPermission", () => {
  it("acepta coincidencia exacta y comodín global", () => {
    expect(hasPermission(["production:read"], "production:read")).toBe(true);
    expect(hasPermission(["*"], "pos:sell")).toBe(true);
  });

  it("acepta comodín de módulo sin filtrar a otros módulos", () => {
    expect(hasPermission(["production:*"], "production:cost:write")).toBe(true);
    expect(hasPermission(["production:*"], "productionx:read")).toBe(false);
    expect(hasPermission(["production:*"], "pos:sell")).toBe(false);
  });

  it("rechaza lo no otorgado", () => {
    expect(hasPermission([], "production:read")).toBe(false);
    expect(hasPermission(["production:read"], "production:write")).toBe(false);
  });
});
