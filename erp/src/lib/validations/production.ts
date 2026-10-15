import { z } from "zod";

const id = z.string().min(1);
const int = (label: string) =>
  z.number({ error: `${label}: ingresá un número` }).int(`${label}: debe ser un número entero`).min(0, `${label}: no puede ser negativo`);
const notes = z.string().trim().max(500).nullable();

export const createOrderSchema = z
  .object({
    productId: id,
    clientId: z.string().nullable(),
    dueDate: z.string().nullable(),
    notes,
    requiresPersonalization: z.boolean(),
    items: z.array(z.object({ variantId: id, quantity: int("Cantidad").max(100000) })).min(1),
  })
  .refine((v) => v.items.some((i) => i.quantity > 0), { message: "Cargá al menos un talle con cantidad", path: ["items"] })
  .refine((v) => !v.dueDate || !Number.isNaN(Date.parse(v.dueDate)), { message: "Fecha inválida", path: ["dueDate"] });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderIdSchema = z.object({ orderId: id });

export const closeCutSchema = z.object({
  orderId: id,
  cutPieces: int("Piezas cortadas").min(1),
  notes,
  /** Tela (u otro material) realmente usada en el corte; la diferencia con lo teórico ajusta el stock */
  materialsUsed: z.array(z.object({ rawMaterialId: id, quantity: z.number().finite().min(0).max(10_000_000) })).max(50).default([]),
});

export const sendSchema = z.object({ orderId: id, workshopId: id, pieces: int("Piezas").min(1), notes });

export const receiveSchema = z.object({
  orderId: id,
  workshopId: id,
  pieces: int("Piezas recibidas"),
  wasteQty: int("Merma"),
  laborUnitCost: z.number().finite().min(0, "El fasón no puede ser negativo").max(10_000_000),
  notes,
});

export const closeQualitySchema = z.object({
  orderId: id,
  approved: z.array(z.object({ variantId: id, quantity: int("Aprobadas") })).min(1),
  notes,
});

export const cancelSchema = z.object({
  orderId: id,
  reason: z.string().trim().min(5, "Indicá el motivo (mínimo 5 caracteres)").max(500),
  /** Devolver al stock los materiales consumidos (si no se llegaron a cortar) */
  returnMaterials: z.boolean().default(false),
});

/** Reglas de consumo de la ficha: consumo por talle y material alternativo por color/tela. */
export const materialRulesSchema = z.object({
  productId: id,
  rules: z
    .array(
      z.object({
        rawMaterialId: id,
        sizeQuantities: z.record(z.string().trim().min(1).max(20), z.number().finite().min(0).max(10_000)),
        alternatives: z
          .array(
            z
              .object({
                color: z.string().trim().max(40).nullable(),
                fabric: z.string().trim().max(60).nullable(),
                rawMaterialId: id,
              })
              .refine((a) => a.color || a.fabric, { message: "Indicá el color o la tela a la que aplica el material alternativo" }),
          )
          .max(30),
      }),
    )
    .max(100),
});
export type MaterialRulesInput = z.infer<typeof materialRulesSchema>;
