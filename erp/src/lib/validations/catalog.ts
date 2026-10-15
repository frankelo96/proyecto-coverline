import { z } from "zod";

import { variantKey } from "@/lib/catalog/variants";

export const variantRowSchema = z.object({
  id: z.string().nullable(),
  size: z.string().trim().min(1, "Indicá el talle").max(20).transform((s) => s.toUpperCase()),
  color: z.string().trim().max(40).nullable(),
  fabric: z.string().trim().max(60).nullable(),
  sku: z.string().trim().max(60).nullable(),
  barcode: z.string().trim().max(40).nullable(),
  // Stock de cada local que se modificó. Puede ser negativo: el POS permite vender sin stock cargado y se regulariza después.
  // `before` es lo que mostraba la pantalla: se aplica la diferencia, así no se pisan ventas hechas mientras tanto.
  stocks: z
    .array(
      z.object({
        branchId: z.string().min(1),
        quantity: z.number({ error: "Stock: ingresá un número" }).finite().min(-10_000_000).max(10_000_000),
        before: z.number().finite().optional(),
      }),
    )
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

export const SCAN_MODES = ["INGRESO", "EGRESO", "CONTEO", "TRANSFERENCIA"] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

/** Movimiento de stock armado escaneando códigos de barras. */
export const scanStockSchema = z
  .object({
    mode: z.enum(SCAN_MODES),
    branchId: z.string().min(1, "Elegí el local"),
    toBranchId: z.string().nullable(),
    lines: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(0).max(100_000) })).min(1, "Escaneá al menos un artículo").max(2000),
    notes: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .transform((s) => (s ? s : null)),
  })
  .refine((v) => v.mode !== "TRANSFERENCIA" || (v.toBranchId && v.toBranchId !== v.branchId), { message: "Elegí un local de destino distinto", path: ["toBranchId"] });
export type ScanStockInput = z.infer<typeof scanStockSchema>;

/** Stock mínimo por variante y local (debajo de ese número aparece en Reposición). */
export const stockMinimumsSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), branchId: z.string().min(1), minQty: z.number().finite().min(0, "El mínimo no puede ser negativo").max(100_000) }))
    .min(1, "No hay cambios para guardar")
    .max(5000),
});
export type StockMinimumsInput = z.infer<typeof stockMinimumsSchema>;
