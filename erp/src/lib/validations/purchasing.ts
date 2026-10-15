import { z } from "zod";

import { UnitOfMeasure } from "@/generated/prisma/enums";

const money = (label: string) => z.number({ error: `${label}: ingresá un número` }).finite().min(0, `${label}: no puede ser negativo`).max(1_000_000_000);
const optText = (max: number) => z.string().trim().max(max).nullable();
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida");

export const PURCHASE_INVOICE_TYPES = ["FACTURA_A", "FACTURA_B", "FACTURA_C", "TICKET_INTERNO"] as const;
export const PURCHASE_INVOICE_LABELS: Record<(typeof PURCHASE_INVOICE_TYPES)[number], string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  TICKET_INTERNO: "Remito / sin factura",
};

const vatRate = z.union([z.literal(21), z.literal(10.5), z.literal(27), z.literal(0)]);

export const invoiceHeaderShape = {
  invoiceType: z.enum(PURCHASE_INVOICE_TYPES),
  pointOfSale: z.number().int().min(1).max(99999).nullable(),
  invoiceNumber: z.string().trim().regex(/^\d{1,8}$/, "Número de comprobante: hasta 8 dígitos").nullable(),
  remitNumber: optText(30),
  date: isoDate,
  dueDate: isoDate.nullable(),
  perceptionIva: money("Percepción IVA"),
  perceptionIibb: money("Percepción IIBB"),
  otherTaxes: money("Otros impuestos"),
  notes: optText(500),
};

export const headerRefine = <T extends { invoiceType: string; pointOfSale: number | null; invoiceNumber: string | null }>(v: T, ctx: z.RefinementCtx) => {
  if (v.invoiceType !== "TICKET_INTERNO" && (!v.pointOfSale || !v.invoiceNumber)) {
    ctx.addIssue({ code: "custom", path: ["invoiceNumber"], message: "Completá punto de venta y número de la factura" });
  }
};

export const merchandiseItemSchema = z
  .object({
    kind: z.enum(["RAW", "VARIANT"]),
    rawMaterialId: z.string().nullable(),
    productVariantId: z.string().nullable(),
    quantity: z.number({ error: "Cantidad: ingresá un número" }).finite().positive("La cantidad debe ser mayor a 0").max(10_000_000),
    uom: z.enum(UnitOfMeasure),
    unitCost: money("Precio unitario"),
    vatRate,
    updateCost: z.boolean(),
    /** Línea de la orden de compra que se recibe (opcional) */
    purchaseOrderItemId: z.string().nullable(),
  })
  .refine((i) => (i.kind === "RAW" ? !!i.rawMaterialId : !!i.productVariantId), { message: "Elegí el artículo", path: ["rawMaterialId"] });

export const merchandisePurchaseSchema = z
  .object({
    supplierId: z.string().min(1, "Elegí el proveedor"),
    purchaseOrderId: z.string().nullable(),
    items: z.array(merchandiseItemSchema).min(1, "Cargá al menos un ítem").max(200),
    ...invoiceHeaderShape,
  })
  .superRefine(headerRefine);

export type MerchandisePurchaseInput = z.infer<typeof merchandisePurchaseSchema>;

export const workshopInvoiceSchema = z
  .object({
    workshopId: z.string().min(1, "Elegí el taller"),
    lines: z
      .array(z.object({ remitId: z.string().min(1), unitCost: money("Precio por prenda"), vatRate }))
      .min(1, "Elegí al menos una recepción a facturar")
      .max(200),
    ...invoiceHeaderShape,
  })
  .superRefine(headerRefine);

export type WorkshopInvoiceInput = z.infer<typeof workshopInvoiceSchema>;

export const PAYMENT_METHODS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "MODO", "TARJETA_DEBITO", "TARJETA_CREDITO"] as const;
/** Medios de pago a proveedores y talleres que ofrece la pantalla. */
export const UI_PAYMENT_OPTIONS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "OWN_CHEQUE", "THIRD_CHEQUE"] as const;
export const UI_PAYMENT_OPTION_LABELS: Record<(typeof UI_PAYMENT_OPTIONS)[number], string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Banco Macro",
  MERCADO_PAGO: "Mercado Pago",
  OWN_CHEQUE: "Cheque propio",
  THIRD_CHEQUE: "Cheque de terceros",
};
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Banco Macro",
  MERCADO_PAGO: "Mercado Pago",
  MODO: "MODO",
  TARJETA_DEBITO: "Tarjeta de débito",
  TARJETA_CREDITO: "Tarjeta de crédito",
  CHEQUE: "Cheque",
  ECHEQ: "eCheq",
  MIXTO: "Varios medios",
  CUENTA_CORRIENTE: "Cuenta corriente",
  SALDO_A_FAVOR: "Saldo a favor",
};

export const instrumentSchema = z.discriminatedUnion("type", [
  /** Efectivo o transferencia que sale de una caja / cuenta (ej. caja negra, banco). */
  z.object({
    type: z.literal("REGISTER"),
    method: z.enum(PAYMENT_METHODS),
    cashRegisterId: z.string().min(1, "Elegí la caja o cuenta"),
    amount: z.number().finite().positive("El importe debe ser mayor a 0"),
    reference: optText(100),
  }),
  /** Endoso de un cheque de terceros en cartera (por su importe completo). */
  z.object({ type: z.literal("THIRD_CHEQUE"), chequeId: z.string().min(1) }),
  /** Cheque propio o eCheq librado contra una cuenta bancaria. */
  /** Saldo a favor con el acreedor (anticipo, nota de crédito o pago de más). */
  z.object({ type: z.literal("CREDIT"), creditId: z.string().min(1), amount: z.number().finite().positive("El importe debe ser mayor a 0") }),
  z.object({
    type: z.literal("OWN_CHEQUE"),
    format: z.enum(["FISICO", "ECHEQ"]),
    bankRegisterId: z.string().min(1, "Elegí la cuenta bancaria"),
    number: z.string().trim().min(1, "Indicá el número de cheque").max(30),
    paymentDate: isoDate,
    amount: z.number().finite().positive("El importe debe ser mayor a 0"),
  }),
]);
export type PaymentInstrument = z.infer<typeof instrumentSchema>;

export const paymentOrderSchema = z
  .object({
    creditorType: z.enum(["SUPPLIER", "WORKSHOP"]),
    creditorId: z.string().min(1),
    payableIds: z.array(z.string().min(1)).max(200),
    instruments: z.array(instrumentSchema).min(1, "Agregá al menos un medio de pago").max(30),
    /** Lo que exceda los comprobantes elegidos queda como anticipo (saldo a favor) */
    excessAsCredit: z.boolean().default(false),
    notes: optText(500),
  })
  .refine((v) => v.payableIds.length > 0 || v.excessAsCredit, { message: "Elegí al menos un comprobante o marcá el pago como anticipo", path: ["payableIds"] });

export type PaymentOrderInput = z.infer<typeof paymentOrderSchema>;

export const annulPurchaseSchema = z.object({
  purchaseId: z.string().min(1),
  reason: z.string().trim().min(5, "Indicá el motivo (mínimo 5 caracteres)").max(500),
});

// --- Órdenes de compra ---------------------------------------------------------------

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Elegí el proveedor"),
  expectedDate: isoDate.nullable(),
  notes: optText(500),
  items: z
    .array(
      z
        .object({
          kind: z.enum(["RAW", "VARIANT"]),
          rawMaterialId: z.string().nullable(),
          productVariantId: z.string().nullable(),
          quantity: z.number().finite().positive("La cantidad debe ser mayor a 0").max(10_000_000),
          uom: z.enum(UnitOfMeasure),
          unitCost: money("Precio unitario"),
          vatRate,
        })
        .refine((i) => (i.kind === "RAW" ? !!i.rawMaterialId : !!i.productVariantId), { message: "Elegí el artículo", path: ["rawMaterialId"] }),
    )
    .min(1, "Cargá al menos un ítem")
    .max(200),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const PURCHASE_ORDER_STATUS_LABELS = { ABIERTA: "Abierta", PARCIAL: "Recibida en parte", RECIBIDA: "Recibida", CANCELADA: "Cancelada" } as const;

// --- Notas de crédito de proveedores ----------------------------------------------------

export const CREDIT_NOTE_TYPES = ["NOTA_CREDITO_A", "NOTA_CREDITO_B", "NOTA_CREDITO_C", "TICKET_INTERNO"] as const;
export const CREDIT_NOTE_LABELS: Record<(typeof CREDIT_NOTE_TYPES)[number], string> = {
  NOTA_CREDITO_A: "Nota de crédito A",
  NOTA_CREDITO_B: "Nota de crédito B",
  NOTA_CREDITO_C: "Nota de crédito C",
  TICKET_INTERNO: "Sin comprobante fiscal",
};

export const creditNoteSchema = z
  .object({
    supplierId: z.string().min(1, "Elegí el proveedor"),
    invoiceType: z.enum(CREDIT_NOTE_TYPES),
    pointOfSale: z.number().int().min(1).max(99999).nullable(),
    invoiceNumber: z.string().trim().regex(/^\d{1,8}$/, "Número de comprobante: hasta 8 dígitos").nullable(),
    date: isoDate,
    notes: optText(500),
    /** Mercadería devuelta al proveedor: sale del stock */
    returns: z
      .array(
        z.object({
          kind: z.enum(["RAW", "VARIANT"]),
          rawMaterialId: z.string().nullable(),
          productVariantId: z.string().nullable(),
          quantity: z.number().finite().positive().max(10_000_000),
          unitCost: money("Precio unitario"),
          vatRate,
        }),
      )
      .max(200),
    /** Bonificaciones, descuentos o diferencias de precio (sin mercadería) */
    concepts: z.array(z.object({ description: z.string().trim().min(3, "Describí el concepto").max(200), amount: money("Importe"), vatRate })).max(50),
    /** Comprobantes a los que se descuenta; lo que sobra queda como saldo a favor */
    payableIds: z.array(z.string().min(1)).max(200),
  })
  .refine((v) => v.returns.length + v.concepts.length > 0, { message: "Cargá la mercadería devuelta o el concepto de la nota de crédito", path: ["concepts"] })
  .refine((v) => v.invoiceType === "TICKET_INTERNO" || (v.pointOfSale && v.invoiceNumber), { message: "Completá punto de venta y número", path: ["invoiceNumber"] });
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;
