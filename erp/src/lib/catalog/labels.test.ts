import { describe, expect, it } from "vitest";

import { decodeLabelItems, encodeLabelItems, LABEL_FORMATS, paginateLabels } from "./labels";

describe("etiquetas", () => {
  it("codifica y decodifica la lista de impresión", () => {
    const raw = encodeLabelItems([
      { variantId: "abc1", qty: 3 },
      { variantId: "zz9", qty: 0 },
      { variantId: "def2", qty: 5000 },
    ]);
    expect(raw).toBe("abc1:3,def2:999");
    expect(decodeLabelItems(raw)).toEqual([
      { variantId: "abc1", qty: 3 },
      { variantId: "def2", qty: 999 },
    ]);
    expect(decodeLabelItems("x:-1,<script>:2,ok:1")).toEqual([{ variantId: "ok", qty: 1 }]);
  });

  it("arma hojas salteando etiquetas ya usadas", () => {
    const pages = paginateLabels(["a", "b", "c", "d"], 3, 2);
    expect(pages).toEqual([[null, null, "a"], ["b", "c", "d"]]);
  });

  it("las hojas A4 entran en 210 × 297 mm", () => {
    for (const f of LABEL_FORMATS.filter((x) => x.kind === "a4")) {
      expect(f.marginLeft + f.cols * f.width + (f.cols - 1) * f.gapX).toBeLessThanOrEqual(210.01);
      expect(f.marginTop + f.rows * f.height + (f.rows - 1) * f.gapY).toBeLessThanOrEqual(297.01);
    }
  });
});
