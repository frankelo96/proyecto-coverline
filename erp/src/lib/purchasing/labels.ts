import type { PurchaseItemType, PurchaseKind, PurchaseStatus, TaxCondition } from "@/generated/prisma/enums";

export const PURCHASE_KIND_LABELS: Record<PurchaseKind, string> = {
  MERCADERIA: "Mercadería",
  SERVICIO_TALLER: "Servicio de taller",
};

export const ITEM_TYPE_LABELS: Record<PurchaseItemType, string> = {
  MATERIA_PRIMA: "Materia prima",
  AVIO_INSUMO: "Avíos e insumos",
  PRODUCTO_TERMINADO: "Producto terminado",
  SERVICIO_CONFECCION: "Confección",
  SERVICIO_PERSONALIZACION: "Personalización",
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

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
