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
  })
  .refine((i) => (i.kind === "RAW" ? !!i.rawMaterialId : !!i.productVariantId), { message: "Elegí el artículo", path: ["rawMaterialId"] });

export const merchandisePurchaseSchema = z
  .object({ supplierId: z.string().min(1, "Elegí el proveedor"), items: z.array(merchandiseItemSchema).min(1, "Cargá al menos un ítem").max(200), ...invoiceHeaderShape })
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
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  MODO: "MODO",
  TARJETA_DEBITO: "Tarjeta de débito",
  TARJETA_CREDITO: "Tarjeta de crédito",
};

export const paymentOrderSchema = z.object({
  creditorType: z.enum(["SUPPLIER", "WORKSHOP"]),
  creditorId: z.string().min(1),
  payableIds: z.array(z.string().min(1)).min(1, "Elegí al menos un comprobante").max(200),
  amount: z.number().finite().positive("El importe debe ser mayor a 0").max(1_000_000_000),
  method: z.enum(PAYMENT_METHODS),
  cashRegisterId: z.string().min(1, "Elegí la caja o cuenta"),
  reference: optText(100),
  notes: optText(500),
});

export type PaymentOrderInput = z.infer<typeof paymentOrderSchema>;

export const annulPurchaseSchema = z.object({
  purchaseId: z.string().min(1),
  reason: z.string().trim().min(5, "Indicá el motivo (mínimo 5 caracteres)").max(500),
});
