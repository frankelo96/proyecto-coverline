/**
 * Presupuestos: precios netos (sin IVA), como se cotiza a empresas e
 * instituciones; el IVA se discrimina por alícuota. Puro, con decimal.js.
 */
import Decimal from "decimal.js";

import type { QuoteStatus } from "@/generated/prisma/enums";

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

const money = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

export interface QuoteLineInput {
  quantity: number;
  /** Precio unitario neto (sin IVA) */
  unitPrice: number;
  discountPct: number;
  vatRate: number;
}

export interface QuoteTotals {
  lines: { gross: number; discount: number; net: number; vat: number; total: number }[];
  gross: number;
  discountTotal: number;
  subtotal: number;
  vatByRate: { rate: number; base: number; vat: number }[];
  taxTotal: number;
  total: number;
}

export function computeQuoteTotals(items: readonly QuoteLineInput[]): QuoteTotals {
  if (items.length === 0) throw new QuoteError("El presupuesto no tiene ítems");
  const byRate = new Map<number, { base: Decimal; vat: Decimal }>();
  let gross = new Decimal(0);
  let discount = new Decimal(0);
  const lines = items.map((it) => {
    if (!(it.quantity > 0)) throw new QuoteError("La cantidad debe ser mayor a cero");
    if (!(it.unitPrice >= 0)) throw new QuoteError("El precio no puede ser negativo");
    if (!(it.discountPct >= 0 && it.discountPct <= 100)) throw new QuoteError("Bonificación inválida");
    const g = new Decimal(it.quantity).mul(it.unitPrice);
    const net = g.mul(new Decimal(100).minus(it.discountPct)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const d = g.minus(net);
    const vat = net.mul(it.vatRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    gross = gross.plus(g);
    discount = discount.plus(d);
    const acc = byRate.get(it.vatRate) ?? { base: new Decimal(0), vat: new Decimal(0) };
    byRate.set(it.vatRate, { base: acc.base.plus(net), vat: acc.vat.plus(vat) });
    return { gross: money(g), discount: money(d), net: money(net), vat: money(vat), total: money(net.plus(vat)) };
  });
  const subtotal = lines.reduce((a, l) => a.plus(l.net), new Decimal(0));
  const taxTotal = lines.reduce((a, l) => a.plus(l.vat), new Decimal(0));
  return {
    lines,
    gross: money(gross),
    discountTotal: money(discount),
    subtotal: money(subtotal),
    vatByRate: [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, v]) => ({ rate, base: money(v.base), vat: money(v.vat) })),
    taxTotal: money(taxTotal),
    total: money(subtotal.plus(taxTotal)),
  };
}

/** Un presupuesto enviado o en borrador cuya validez pasó se muestra como vencido. */
export function effectiveQuoteStatus(status: QuoteStatus, validUntil: Date, now = new Date()): QuoteStatus {
  if ((status === "BORRADOR" || status === "ENVIADO") && validUntil.getTime() < startOfDay(now).getTime()) return "VENCIDO";
  return status;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Transiciones de estado permitidas desde la pantalla. */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  BORRADOR: ["ENVIADO", "ACEPTADO", "RECHAZADO"],
  ENVIADO: ["ACEPTADO", "RECHAZADO", "BORRADOR"],
  VENCIDO: ["ENVIADO", "ACEPTADO", "RECHAZADO"],
  ACEPTADO: ["ENVIADO"],
  RECHAZADO: ["ENVIADO"],
};

export const isEditableQuote = (status: QuoteStatus) => status === "BORRADOR" || status === "ENVIADO" || status === "VENCIDO";

/** Reemplaza {nombre}, {empresa}, etc. en mensajes de campañas y envíos. */
export function fillTemplate(template: string, data: Record<string, string | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = data[k.toLowerCase()];
    return v === undefined ? m : (v ?? "");
  });
}
