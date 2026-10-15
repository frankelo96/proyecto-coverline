import { z } from "zod";

const id = z.string().min(1);
const money = (label: string) => z.number({ error: `${label}: ingresá un número` }).finite().min(0, `${label}: no puede ser negativo`).max(10_000_000_000);
const positive = (label: string) => z.number({ error: `${label}: ingresá un número` }).finite().positive(`${label}: debe ser mayor a 0`).max(10_000_000_000);
const optText = (max: number) => z.string().trim().max(max).nullable();
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida");

// --- Turnos y movimientos --------------------------------------------------------

export const openSessionSchema = z.object({ registerId: id, countedAmount: money("Efectivo contado"), notes: optText(300) });

export const closeSessionSchema = z.object({
  sessionId: id,
  declaredAmount: money("Efectivo contado"),
  /** Retiro a caja negra al cerrar, dejando el resto como fondo. */
  withdrawToId: z.string().nullable(),
  withdrawAmount: money("Retiro"),
  notes: optText(300),
});

export const transferSchema = z.object({
  fromId: id,
  toId: id,
  amount: positive("Importe"),
  concept: z.string().trim().min(3, "Indicá el concepto").max(200),
});

export const manualMovementSchema = z.object({
  registerId: id,
  direction: z.enum(["IN", "OUT"]),
  amount: positive("Importe"),
  concept: z.string().trim().min(3, "Indicá el concepto").max(200),
});

// --- Cheques -----------------------------------------------------------------------

export const chequeDataSchema = z.object({
  format: z.enum(["FISICO", "ECHEQ"]),
  bank: z.string().trim().min(2, "Indicá el banco").max(60),
  number: z.string().trim().min(1, "Indicá el número").max(30),
  issuerName: z.string().trim().min(2, "Indicá el librador").max(120),
  issuerCuit: z.string().trim().regex(/^\d{2}-?\d{8}-?\d$/, "CUIT inválido").nullable(),
  issueDate: isoDate,
  paymentDate: isoDate,
});
export type ChequeData = z.infer<typeof chequeDataSchema>;

export const chequeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DEPOSITAR"), chequeId: id, registerId: id }),
  z.object({ action: z.literal("COBRAR"), chequeId: id, registerId: id }),
  z.object({ action: z.literal("DEBITAR"), chequeId: id }),
  z.object({ action: z.literal("RECHAZAR"), chequeId: id, reason: z.string().trim().min(5, "Indicá el motivo").max(300) }),
  z.object({ action: z.literal("ANULAR"), chequeId: id, reason: z.string().trim().min(5, "Indicá el motivo").max(300) }),
]);
export type ChequeAction = z.infer<typeof chequeActionSchema>;

// --- Cobros (venta y cobranza) -----------------------------------------------------------

export const COLLECTION_METHODS = ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "MERCADO_PAGO", "MODO", "TRANSFERENCIA", "CHEQUE", "ECHEQ", "CUENTA_CORRIENTE", "VALE"] as const;

/**
 * Medios que ofrece la pantalla (los que usa Coverline): Efectivo, Banco Macro,
 * Mercado Pago y Cheque de terceros (físico o eCheq), más cuenta corriente en el POS.
 * Tarjetas y MODO siguen aceptándose para el historial pero no se ofrecen.
 */
export const UI_COLLECTION_METHODS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "CHEQUE", "VALE", "CUENTA_CORRIENTE"] as const;

export const collectionPaymentSchema = z
  .object({
    method: z.enum(COLLECTION_METHODS),
    amount: positive("Importe"),
    reference: optText(100),
    cardBrand: optText(30),
    installments: z.number().int().min(1).max(24).nullable(),
    cheque: chequeDataSchema.nullable(),
  })
  .refine((p) => (p.method === "CHEQUE" || p.method === "ECHEQ" ? p.cheque !== null : true), { message: "Completá los datos del cheque", path: ["cheque"] })
  .refine((p) => (p.method === "VALE" ? !!p.reference && p.reference.replace(/[^0-9A-Za-z]/g, "").length === 8 : true), { message: "Ingresá el código del vale (8 caracteres)", path: ["reference"] });
export type CollectionPayment = z.infer<typeof collectionPaymentSchema>;

// --- Venta POS ---------------------------------------------------------------------------

export const saleSchema = z.object({
  registerId: id,
  clientId: z.string().nullable(),
  /** Lista de precios; si se omite se usa la del cliente */
  priceListId: z.string().nullable().default(null),
  invoiceType: z.enum(["TICKET_INTERNO", "FACTURA_B", "FACTURA_A"]),
  items: z
    .array(
      z
        .object({
          variantId: z.string().nullable(),
          description: z.string().trim().max(200).nullable(),
          quantity: positive("Cantidad").max(100000),
          /** Solo para ítems libres; en prendas del catálogo el servidor usa el precio de lista. */
          unitPrice: money("Precio"),
          discountPct: z.number().finite().min(0).max(100),
        })
        .refine((i) => i.variantId || (i.description && i.description.length >= 3), { message: "Ítem libre sin descripción", path: ["description"] }),
    )
    .min(1, "Agregá al menos un artículo")
    .max(200),
  globalDiscountPct: z.number().finite().min(0).max(100),
  discountReason: optText(200),
  payments: z.array(collectionPaymentSchema).min(1, "Cargá al menos un medio de pago").max(10),
  deliveryMethod: z.enum(["RETIRO_SUCURSAL", "ENVIO"]),
  shippingAddress: optText(200),
  notes: optText(300),
});
export type SaleInput = z.infer<typeof saleSchema>;

// --- Cobranza de cuenta corriente --------------------------------------------------------

export const receiptSchema = z.object({
  clientId: id,
  registerId: id,
  receivableIds: z.array(id).min(1, "Elegí al menos una deuda").max(200),
  payments: z
    .array(collectionPaymentSchema)
    .min(1, "Cargá al menos un medio de cobro")
    .max(10)
    .refine((ps) => ps.every((p) => p.method !== "CUENTA_CORRIENTE"), "La cuenta corriente no es un medio de cobro"),
  notes: optText(300),
});
export type ReceiptInput = z.infer<typeof receiptSchema>;
