import { z } from "zod";

import { variantKey } from "@/lib/catalog/variants";

export const variantRowSchema = z.object({
  id: z.string().nullable(),
  size: z.string().trim().min(1, "Indicá el talle").max(20).transform((s) => s.toUpperCase()),
  color: z.string().trim().max(40).nullable(),
  fabric: z.string().trim().max(60).nullable(),
  sku: z.string().trim().max(60).nullable(),
  barcode: z.string().trim().max(40).nullable(),
  // Stock de cada local. Puede ser negativo: el POS permite vender sin stock cargado y se regulariza después.
  stocks: z
    .array(z.object({ branchId: z.string().min(1), quantity: z.number({ error: "Stock: ingresá un número" }).finite().min(-10_000_000).max(10_000_000) }))
    .max(20),
  priceAdjustmentPct: z.number().finite().min(-50).max(200),
  active: z.boolean(),
});

export const saveVariantsSchema = z
  .object({
    productId: z.string().min(1),
    variants: z.array(variantRowSchema).max(300),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.variants.forEach((row, i) => {
      const key = variantKey(row);
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["variants", i, "size"], message: `Talle ${row.size}${row.color ? ` ${row.color}` : ""}${row.fabric ? ` ${row.fabric}` : ""} repetido` });
      seen.add(key);
    });
  });

export type SaveVariantsInput = z.infer<typeof saveVariantsSchema>;

export const stockTransferSchema = z.object({
  fromBranchId: z.string().min(1, "Elegí el local de origen"),
  toBranchId: z.string().min(1, "Elegí el local de destino"),
  lines: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().finite().min(0).max(100_000) })).min(1).max(500),
  notes: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .transform((s) => (s ? s : null)),
});
