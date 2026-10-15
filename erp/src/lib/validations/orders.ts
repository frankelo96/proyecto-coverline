import { z } from "zod";

import { collectionPaymentSchema } from "./treasury";

const id = z.string().min(1);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => s || null);

export const ORDER_STATUS_LABELS = {
  ABIERTO: "Abierto",
  EN_PRODUCCION: "En producción",
  LISTO: "Listo para entregar",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS_LABELS;

/** Medios para cobrar una seña (la cuenta corriente no es una seña). */
const depositPayments = z
  .array(collectionPaymentSchema)
  .min(1, "Cargá el importe de la seña")
  .max(10)
  .refine((ps) => ps.every((p) => p.method !== "CUENTA_CORRIENTE"), "La seña no se puede dejar en cuenta corriente");

export const orderItemSchema = z
  .object({
    productId: z.string().nullable(),
    variantId: z.string().nullable(),
    description: z.string().trim().max(200),
    quantity: z.number().finite().positive("La cantidad debe ser mayor a 0").max(100_000),
    /** Precio final unitario con IVA */
    unitPrice: z.number().finite().min(0).max(10_000_000_000),
    discountPct: z.number().finite().min(0).max(100),
  })
  .refine((i) => i.variantId || (!i.productId && i.description.length >= 3), { message: "Elegí el talle de cada prenda o describí el ítem libre", path: ["variantId"] });

export const createOrderSchema = z.object({
  clientId: z.string().min(1, "Elegí el cliente"),
  quoteId: z.string().nullable(),
  branchId: z.string().min(1, "Elegí el local"),
  promisedDate: z
    .string()
    .nullable()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida"),
  notes: optText(500),
  discountReason: optText(200),
  items: z.array(orderItemSchema).min(1, "Agregá al menos un artículo").max(200),
  /** Seña cobrada al tomar el pedido (opcional) */
  deposit: z.object({ registerId: id, payments: depositPayments }).nullable(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const depositSchema = z.object({ orderId: id, registerId: z.string().min(1, "Elegí la caja"), payments: depositPayments });
export type DepositInput = z.infer<typeof depositSchema>;

export const deliverSchema = z.object({
  orderId: id,
  registerId: z.string().min(1, "Elegí la caja"),
  invoiceType: z.enum(["TICKET_INTERNO", "FACTURA_B", "FACTURA_A"]),
  /** Local del que sale la mercadería (el mayorista si se produjo para el cliente) */
  stockBranchId: z.string().min(1, "Elegí de qué local sale la mercadería"),
  payments: z.array(collectionPaymentSchema).max(10),
});
export type DeliverInput = z.infer<typeof deliverSchema>;

export const CANCEL_REFUNDS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "VALE", "RETENER"] as const;
export const CANCEL_REFUND_LABELS: Record<(typeof CANCEL_REFUNDS)[number], string> = {
  EFECTIVO: "Devolver en efectivo",
  TRANSFERENCIA: "Devolver por transferencia (Banco Macro)",
  MERCADO_PAGO: "Devolver por Mercado Pago",
  VALE: "Dejarla como vale (saldo a favor)",
  RETENER: "Retener la seña (el cliente desistió)",
};

export const cancelOrderSchema = z.object({
  orderId: id,
  reason: z.string().trim().min(5, "Indicá el motivo (mínimo 5 caracteres)").max(300),
  refund: z.enum(CANCEL_REFUNDS),
  registerId: z.string().nullable(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
