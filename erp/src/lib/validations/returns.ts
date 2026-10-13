import { z } from "zod";

export const REFUND_METHODS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "CUENTA_CORRIENTE"] as const;

export const returnSchema = z.object({
  originalSaleId: z.string().min(1),
  /** Caja diaria con turno abierto donde se registra la devolución (y de donde sale el efectivo). */
  registerId: z.string().min(1, "Elegí la caja"),
  items: z
    .array(
      z.object({
        originalItemId: z.string().min(1),
        quantity: z.number().finite().min(0).max(100000),
        restock: z.boolean(),
      }),
    )
    .min(1)
    .max(200)
    .refine((items) => items.some((i) => i.quantity > 0), "Indicá qué se devuelve"),
  reason: z.string().trim().min(5, "Indicá el motivo de la devolución (mínimo 5 caracteres)").max(300),
  refundMethod: z.enum(REFUND_METHODS),
  reference: z.string().trim().max(100).nullable(),
});

export type ReturnInput = z.infer<typeof returnSchema>;
