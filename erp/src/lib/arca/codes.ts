/**
 * Tablas de ARCA (WSFEv1). Fuente: FEParamGetTiposCbte / TiposDoc / TiposIva /
 * CondicionIvaReceptor.
 */
import type { DocumentType, InvoiceType, TaxCondition } from "@/generated/prisma/enums";

export const CBTE_TIPO: Partial<Record<InvoiceType, number>> = {
  FACTURA_A: 1,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_CREDITO_C: 13,
};

export const isFiscal = (t: InvoiceType) => CBTE_TIPO[t] !== undefined;

/** Nota de crédito que corresponde a cada factura (devoluciones). */
export const CREDIT_NOTE_FOR: Partial<Record<InvoiceType, InvoiceType>> = {
  FACTURA_A: "NOTA_CREDITO_A",
  FACTURA_B: "NOTA_CREDITO_B",
  FACTURA_C: "NOTA_CREDITO_C",
  TICKET_INTERNO: "TICKET_INTERNO",
};

export const DOC_TIPO = { CUIT: 80, CUIL: 86, DNI: 96, PASAPORTE: 94, SIN_IDENTIFICAR: 99 } as const;

export const DOC_TIPO_FOR: Record<DocumentType, number> = {
  CUIT: DOC_TIPO.CUIT,
  CUIL: DOC_TIPO.CUIL,
  DNI: DOC_TIPO.DNI,
  PASAPORTE: DOC_TIPO.PASAPORTE,
};

/** Condición frente al IVA del receptor (obligatoria desde la RG 5616). */
export const CONDICION_IVA_RECEPTOR: Record<TaxCondition, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
};

/** Id de alícuota de IVA de ARCA. */
export const IVA_ID: Record<string, number> = { "0": 3, "10.5": 4, "21": 5, "27": 6 };

export function ivaIdFor(rate: number) {
  const id = IVA_ID[String(rate)];
  if (!id) throw new Error(`Alícuota de IVA ${rate}% no soportada por ARCA`);
  return id;
}

/** Formato AAAAMMDD en hora de Argentina. */
export function arcaDate(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts.replaceAll("-", "");
}

export function parseArcaDate(s: string) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Fecha ARCA inválida: ${s}`);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T03:00:00Z`);
}

export function voucherNumber(pointOfSale: number | null, number: number | null) {
  return `${String(pointOfSale ?? 0).padStart(5, "0")}-${String(number ?? 0).padStart(8, "0")}`;
}

/** CUIT sin guiones como número. */
export function cuitDigits(cuit: string) {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) throw new Error(`CUIT inválido: ${cuit}`);
  return d;
}

/** Dígito verificador de CUIT/CUIL (módulo 11). */
export function isValidCuit(cuit: string) {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((a, w, i) => a + w * Number(d[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(d[10]);
}
