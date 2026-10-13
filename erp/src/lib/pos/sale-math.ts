/**
 * Cálculos del punto de venta — puros, con decimal.js.
 * Los precios de mostrador son finales (IVA incluido); el neto y el IVA se
 * desglosan por línea para la factura.
 */
import Decimal from "decimal.js";

import type { PaymentMethod } from "@/generated/prisma/enums";

export class SaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleError";
  }
}

const money = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const HUNDRED = new Decimal(100);

/** Precio final de mostrador = lista neta × (1 + IVA) × (1 + ajuste del talle). */
export function finalUnitPrice(listPriceNet: number, vatRate: number, adjustmentPct = 0): number {
  return money(new Decimal(listPriceNet).mul(HUNDRED.plus(vatRate)).div(100).mul(HUNDRED.plus(adjustmentPct)).div(100));
}

export interface SaleLineInput {
  quantity: number;
  /** Precio unitario final (IVA incluido) */
  unitPrice: number;
  discountPct: number;
  vatRate: number;
}

export interface SaleLineResult {
  gross: number;
  discount: number;
  total: number;
  net: number;
  vat: number;
}

export interface SaleTotals {
  lines: SaleLineResult[];
  gross: number;
  discountTotal: number;
  subtotal: number;
  vat21: number;
  vat105: number;
  taxTotal: number;
  total: number;
}

export function computeSaleTotals(items: SaleLineInput[], globalDiscountPct = 0): SaleTotals {
  if (items.length === 0) throw new SaleError("La venta no tiene ítems");
  if (!(globalDiscountPct >= 0 && globalDiscountPct <= 100)) throw new SaleError("Descuento general inválido");
  const globalFactor = HUNDRED.minus(globalDiscountPct).div(100);
  let gross = new Decimal(0);
  let discount = new Decimal(0);
  let net = new Decimal(0);
  const vatByRate = new Map<number, Decimal>();

  const lines = items.map((l, i) => {
    const n = i + 1;
    if (!(l.quantity > 0)) throw new SaleError(`Línea ${n}: la cantidad debe ser mayor a 0`);
    if (!(l.unitPrice >= 0)) throw new SaleError(`Línea ${n}: precio inválido`);
    if (!(l.discountPct >= 0 && l.discountPct <= 100)) throw new SaleError(`Línea ${n}: descuento inválido`);
    const lineGross = new Decimal(l.quantity).mul(l.unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const afterLine = lineGross.mul(HUNDRED.minus(l.discountPct)).div(100);
    const lineTotal = afterLine.mul(globalFactor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const lineNet = lineTotal.div(HUNDRED.plus(l.vatRate).div(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const lineVat = lineTotal.minus(lineNet);
    gross = gross.plus(lineGross);
    discount = discount.plus(lineGross.minus(lineTotal));
    net = net.plus(lineNet);
    vatByRate.set(l.vatRate, (vatByRate.get(l.vatRate) ?? new Decimal(0)).plus(lineVat));
    return { gross: money(lineGross), discount: money(lineGross.minus(lineTotal)), total: money(lineTotal), net: money(lineNet), vat: money(lineVat) };
  });

  const taxTotal = [...vatByRate.values()].reduce((a, v) => a.plus(v), new Decimal(0));
  return {
    lines,
    gross: money(gross),
    discountTotal: money(discount),
    subtotal: money(net),
    vat21: money(vatByRate.get(21) ?? new Decimal(0)),
    vat105: money(vatByRate.get(10.5) ?? new Decimal(0)),
    taxTotal: money(taxTotal),
    total: money(net.plus(taxTotal)),
  };
}

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

export interface PaymentPlan {
  paid: number;
  change: number;
  /** Efectivo que efectivamente queda en la caja (recibido − vuelto). */
  cashKept: number;
  onAccount: number;
}

/**
 * Valida los medios de cobro de una venta. Solo el efectivo puede exceder el
 * total (genera vuelto); el resto de los medios no puede superar lo que falta.
 */
export function planPayments(total: number, payments: PaymentLine[]): PaymentPlan {
  if (payments.length === 0) throw new SaleError("Cargá al menos un medio de pago");
  let cash = new Decimal(0);
  let other = new Decimal(0);
  let onAccount = new Decimal(0);
  for (const p of payments) {
    if (!(p.amount > 0)) throw new SaleError("Cada pago debe ser mayor a 0");
    if (p.method === "MIXTO") throw new SaleError("Medio de pago inválido");
    if (p.method === "EFECTIVO") cash = cash.plus(p.amount);
    else other = other.plus(p.amount);
    if (p.method === "CUENTA_CORRIENTE") onAccount = onAccount.plus(p.amount);
  }
  const t = new Decimal(total);
  if (other.gt(t)) throw new SaleError("Los pagos que no son en efectivo superan el total");
  const paid = cash.plus(other);
  if (paid.lt(t)) throw new SaleError(`Faltan ${money(t.minus(paid)).toLocaleString("es-AR", { style: "currency", currency: "ARS" })} para completar el pago`);
  const change = paid.minus(t);
  return { paid: money(paid), change: money(change), cashKept: money(cash.minus(change)), onAccount: money(onAccount) };
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
