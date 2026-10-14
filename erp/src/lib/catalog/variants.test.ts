import { describe, expect, it } from "vitest";

import { autoVariantSku, combineVariants, compareSizes, splitValues, variantKey, variantLabel, variantOptions } from "./variants";

describe("variantes", () => {
  it("combina talles × colores × telas", () => {
    const v = combineVariants(["S", "M"], ["Blanco", "Azul"], ["Algodón"]);
    expect(v).toHaveLength(4);
    expect(v[0]).toEqual({ size: "S", color: "Blanco", fabric: "Algodón" });
    expect(combineVariants(["U"], [], [])).toEqual([{ size: "U", color: null, fabric: null }]);
  });

  it("arma SKU, etiqueta y clave", () => {
    expect(autoVariantSku("REM-LS", { size: "m", color: "Azul marino", fabric: "Algodón peinado" })).toBe("REM-LS-M-AZUL-ALGO");
    expect(variantLabel("Remera La Salle", { size: "M", color: "Blanco", fabric: "Algodón" })).toBe("Remera La Salle T.M Blanco · Algodón");
    expect(variantLabel("Gorro", { size: "U" })).toBe("Gorro T.U");
    expect(variantKey({ size: "M", color: "Algodón", fabric: null })).toBe(variantKey({ size: "M", color: "ALGODON", fabric: "" }));
  });

  it("separa listas y ordena talles", () => {
    expect(splitValues("s, m; L, xl, M", true)).toEqual(["S", "M", "L", "XL"]);
    expect(splitValues("Jersey algodón 24/1, Piqué")).toEqual(["Jersey algodón 24/1", "Piqué"]);
    expect(["10", "L", "S", "4", "U"].sort(compareSizes)).toEqual(["4", "10", "S", "L", "U"]);
    expect(variantOptions([{ size: "L", color: "Blanco" }, { size: "S", color: "Azul" }, { size: "S", color: "Blanco" }])).toEqual({
      colors: ["Azul", "Blanco"],
      fabrics: [],
      sizes: ["S", "L"],
    });
  });
});
