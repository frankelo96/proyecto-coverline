import type { PurchaseItemType, PurchaseKind, PurchaseStatus, TaxCondition } from "@/generated/prisma/enums";
import { isoLocalDate } from "@/lib/dates";

export const PURCHASE_KIND_LABELS: Record<PurchaseKind, string> = {
  MERCADERIA: "Mercadería",
  SERVICIO_TALLER: "Servicio de taller",
  NOTA_CREDITO: "Nota de crédito de proveedor",
};

export const ITEM_TYPE_LABELS: Record<PurchaseItemType, string> = {
  MATERIA_PRIMA: "Materia prima",
  AVIO_INSUMO: "Avíos e insumos",
  PRODUCTO_TERMINADO: "Producto terminado",
  SERVICIO_CONFECCION: "Confección",
  SERVICIO_PERSONALIZACION: "Personalización",
  OTRO: "Bonificación / otros",
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  BORRADOR: "Borrador",
  RECIBIDA: "Registrada",
  ANULADA: "Anulada",
};

export const TAX_CONDITION_LABELS: Record<TaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: "Resp. inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
  CONSUMIDOR_FINAL: "Consumidor final",
};

/** Comprobante sugerido según la condición frente al IVA del emisor (Coverline es RI). */
export const suggestedInvoiceType = (tax: TaxCondition) => (tax === "RESPONSABLE_INSCRIPTO" ? "FACTURA_A" : "FACTURA_C");

/** Hoy en AAAA-MM-DD, hora argentina (igual en el navegador y en el servidor). */
export const todayIso = () => isoLocalDate();
