/**
 * Armado del pedido FECAESolicitar a partir de una venta — puro y validado.
 */
import Decimal from "decimal.js";

import type { DocumentType, InvoiceType, TaxCondition } from "@/generated/prisma/enums";

import { arcaDate, CBTE_TIPO, CONDICION_IVA_RECEPTOR, cuitDigits, DOC_TIPO, DOC_TIPO_FOR, ivaIdFor } from "./codes";

export class ArcaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArcaError";
  }
}

export interface ReceiverInput {
  documentType: DocumentType | null;
  documentNumber: string | null;
  taxCondition: TaxCondition;
}

export interface Receiver {
  docTipo: number;
  docNro: string;
  condicionIvaReceptorId: number;
}

/** Receptor según comprobante: A exige CUIT de responsable inscripto; B admite consumidor final sin identificar. */
export function receiverFor(invoiceType: InvoiceType, client: ReceiverInput | null): Receiver {
  const isA = invoiceType === "FACTURA_A" || invoiceType === "NOTA_CREDITO_A";
  if (isA) {
    if (!client || client.taxCondition !== "RESPONSABLE_INSCRIPTO" || client.documentType !== "CUIT" || !client.documentNumber) {
      throw new ArcaError("Los comprobantes A requieren un receptor responsable inscripto con CUIT");
    }
    return { docTipo: DOC_TIPO.CUIT, docNro: cuitDigits(client.documentNumber), condicionIvaReceptorId: CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO };
  }
  if (client?.taxCondition === "RESPONSABLE_INSCRIPTO") throw new ArcaError("A un responsable inscripto corresponde factura A");
  if (!client || !client.documentType || !client.documentNumber) {
    return { docTipo: DOC_TIPO.SIN_IDENTIFICAR, docNro: "0", condicionIvaReceptorId: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL };
  }
  const docNro = client.documentNumber.replace(/\D/g, "");
  if (!docNro) throw new ArcaError("Documento del cliente inválido");
  return { docTipo: DOC_TIPO_FOR[client.documentType], docNro, condicionIvaReceptorId: CONDICION_IVA_RECEPTOR[client.taxCondition] };
}

export interface InvoiceLine {
  /** Total final de la línea (IVA incluido, con descuentos) */
  total: number;
  vatRate: number;
}

export interface VatBreakdown {
  net: number;
  vat: number;
  total: number;
  byRate: { id: number; rate: number; base: number; amount: number }[];
}

/** Desglose por alícuota con el mismo redondeo por línea que el POS. */
export function vatBreakdown(lines: InvoiceLine[]): VatBreakdown {
  const groups = new Map<number, { base: Decimal; amount: Decimal }>();
  for (const l of lines) {
    const total = new Decimal(l.total);
    const net = total.div(new Decimal(100).plus(l.vatRate).div(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const g = groups.get(l.vatRate) ?? { base: new Decimal(0), amount: new Decimal(0) };
    groups.set(l.vatRate, { base: g.base.plus(net), amount: g.amount.plus(total.minus(net)) });
  }
  const byRate = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => ({ id: ivaIdFor(rate), rate, base: g.base.toNumber(), amount: g.amount.toNumber() }));
  const net = byRate.reduce((a, r) => a.plus(r.base), new Decimal(0));
  const vat = byRate.reduce((a, r) => a.plus(r.amount), new Decimal(0));
  return { net: net.toNumber(), vat: vat.toNumber(), total: net.plus(vat).toNumber(), byRate };
}

export interface FecaeRequest {
  PtoVta: number;
  CbteTipo: number;
  Concepto: 1;
  DocTipo: number;
  DocNro: string;
  CbteDesde: number;
  CbteHasta: number;
  CbteFch: string;
  ImpTotal: number;
  ImpTotConc: 0;
  ImpNeto: number;
  ImpOpEx: 0;
  ImpTrib: 0;
  ImpIVA: number;
  MonId: "PES";
  MonCotiz: 1;
  CondicionIVAReceptorId: number;
  Iva: { Id: number; BaseImp: number; Importe: number }[];
  CbtesAsoc?: { Tipo: number; PtoVta: number; Nro: number; Cuit: string; CbteFch: string }[];
}

export function buildFecaeRequest(input: {
  invoiceType: InvoiceType;
  pointOfSale: number;
  number: number;
  date: Date;
  receiver: Receiver;
  lines: InvoiceLine[];
  /** Total registrado en la venta: debe coincidir con el desglose */
  expectedTotal: number;
  issuerCuit: string;
  associated?: { invoiceType: InvoiceType; pointOfSale: number; number: number; date: Date } | null;
}): FecaeRequest {
  const cbteTipo = CBTE_TIPO[input.invoiceType];
  if (!cbteTipo) throw new ArcaError("El comprobante no es electrónico");
  if (!Number.isInteger(input.number) || input.number < 1) throw new ArcaError("Número de comprobante inválido");
  if (input.lines.length === 0) throw new ArcaError("El comprobante no tiene ítems");
  const b = vatBreakdown(input.lines);
  if (Math.abs(b.total - input.expectedTotal) > 0.009) {
    throw new ArcaError(`El desglose de IVA (${b.total}) no coincide con el total de la venta (${input.expectedTotal})`);
  }
  const isCreditNote = input.invoiceType.startsWith("NOTA_CREDITO");
  if (isCreditNote && !input.associated) throw new ArcaError("La nota de crédito debe asociar la factura original");

  const req: FecaeRequest = {
    PtoVta: input.pointOfSale,
    CbteTipo: cbteTipo,
    Concepto: 1,
    DocTipo: input.receiver.docTipo,
    DocNro: input.receiver.docNro,
    CbteDesde: input.number,
    CbteHasta: input.number,
    CbteFch: arcaDate(input.date),
    ImpTotal: b.total,
    ImpTotConc: 0,
    ImpNeto: b.net,
    ImpOpEx: 0,
    ImpTrib: 0,
    ImpIVA: b.vat,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: input.receiver.condicionIvaReceptorId,
    Iva: b.byRate.map((r) => ({ Id: r.id, BaseImp: r.base, Importe: r.amount })),
  };
  if (input.associated) {
    const t = CBTE_TIPO[input.associated.invoiceType];
    if (!t) throw new ArcaError("El comprobante asociado no es electrónico");
    req.CbtesAsoc = [{ Tipo: t, PtoVta: input.associated.pointOfSale, Nro: input.associated.number, Cuit: cuitDigits(input.issuerCuit), CbteFch: arcaDate(input.associated.date) }];
  }
  return req;
}

/** URL del QR fiscal (RG 4291). */
export function buildQrUrl(input: {
  date: Date;
  issuerCuit: string;
  pointOfSale: number;
  cbteTipo: number;
  number: number;
  total: number;
  docTipo: number;
  docNro: string;
  cae: string;
}) {
  const payload = {
    ver: 1,
    fecha: arcaDate(input.date).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
    cuit: Number(cuitDigits(input.issuerCuit)),
    ptoVta: input.pointOfSale,
    tipoCmp: input.cbteTipo,
    nroCmp: input.number,
    importe: input.total,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: input.docTipo,
    nroDocRec: Number(input.docNro),
    tipoCodAut: "E",
    codAut: Number(input.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}
