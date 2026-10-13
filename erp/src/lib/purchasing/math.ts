/**
 * Cálculos de compras y cuentas a pagar — puros, sin I/O, con decimal.js.
 */
import Decimal from "decimal.js";

import type { InvoiceType, UnitOfMeasure } from "@/generated/prisma/enums";

export class PurchasingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasingError";
  }
}

const money = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const cost4 = (d: Decimal) => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();

/** Solo los comprobantes A discriminan IVA (crédito fiscal). B/C/ticket: el precio es final. */
export const discriminatesVat = (type: InvoiceType | null | undefined) =>
  type === "FACTURA_A" || type === "NOTA_CREDITO_A";

export const VAT_RATES = [21, 10.5, 27, 0] as const;

/** Unidades en que se puede comprar cada unidad de stock. */
export function purchasableUoms(stockUom: UnitOfMeasure, metersPerKg: number | null): UnitOfMeasure[] {
  if (stockUom === "METRO" && metersPerKg && metersPerKg > 0) return ["METRO", "KILOGRAMO"];
  if (stockUom === "KILOGRAMO" && metersPerKg && metersPerKg > 0) return ["KILOGRAMO", "METRO"];
  return [stockUom];
}

/**
 * Convierte cantidad y costo del comprobante a la unidad de stock.
 * Ej.: tela en stock por metro comprada por kg con rendimiento 2,6 m/kg:
 *   25 kg a $ 17.680/kg → 65 m a $ 6.800/m.
 */
export function convertToStockUnit(params: {
  purchasedUom: UnitOfMeasure;
  stockUom: UnitOfMeasure;
  metersPerKg: number | null;
  quantity: number;
  unitCost: number;
}): { stockQuantity: number; stockUnitCost: number } {
  const qty = new Decimal(params.quantity);
  const price = new Decimal(params.unitCost);
  if (params.purchasedUom === params.stockUom) return { stockQuantity: cost4(qty), stockUnitCost: cost4(price) };
  const mpk = params.metersPerKg ? new Decimal(params.metersPerKg) : null;
  if (!mpk || mpk.lte(0)) {
    throw new PurchasingError("Falta el rendimiento metros/kg de la tela para convertir la unidad");
  }
  if (params.purchasedUom === "KILOGRAMO" && params.stockUom === "METRO") {
    return { stockQuantity: cost4(qty.mul(mpk)), stockUnitCost: cost4(price.div(mpk)) };
  }
  if (params.purchasedUom === "METRO" && params.stockUom === "KILOGRAMO") {
    return { stockQuantity: cost4(qty.div(mpk)), stockUnitCost: cost4(price.mul(mpk)) };
  }
  throw new PurchasingError(`No se puede convertir de ${params.purchasedUom} a ${params.stockUom}`);
}

export interface TotalsLine {
  quantity: number;
  unitCost: number;
  vatRate: number;
}

export interface PurchaseTotals {
  lines: { subtotal: number; vat: number }[];
  subtotal: number;
  vat21: number;
  vat105: number;
  vat27: number;
  taxTotal: number;
  perceptionIva: number;
  perceptionIibb: number;
  otherTaxes: number;
  total: number;
}

export function computePurchaseTotals(
  lines: TotalsLine[],
  extras: { perceptionIva: number; perceptionIibb: number; otherTaxes: number },
  invoiceType: InvoiceType | null | undefined,
): PurchaseTotals {
  const withVat = discriminatesVat(invoiceType);
  const byRate = new Map<number, Decimal>();
  let subtotal = new Decimal(0);
  const out = lines.map((l, i) => {
    if (!(l.quantity >= 0) || !(l.unitCost >= 0)) throw new PurchasingError(`Línea ${i + 1}: cantidad y precio no pueden ser negativos`);
    if (withVat && !VAT_RATES.includes(l.vatRate as (typeof VAT_RATES)[number])) {
      throw new PurchasingError(`Línea ${i + 1}: alícuota de IVA inválida`);
    }
    const net = new Decimal(l.quantity).mul(l.unitCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const vat = withVat ? net.mul(l.vatRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    subtotal = subtotal.plus(net);
    if (withVat) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? new Decimal(0)).plus(vat));
    return { subtotal: money(net), vat: money(vat) };
  });
  for (const [k, v] of Object.entries(extras)) {
    if (!(v >= 0)) throw new PurchasingError(`${k}: no puede ser negativo`);
  }
  const vat21 = byRate.get(21) ?? new Decimal(0);
  const vat105 = byRate.get(10.5) ?? new Decimal(0);
  const vat27 = byRate.get(27) ?? new Decimal(0);
  const taxTotal = vat21.plus(vat105).plus(vat27);
  const total = subtotal
    .plus(taxTotal)
    .plus(extras.perceptionIva)
    .plus(extras.perceptionIibb)
    .plus(extras.otherTaxes);
  return {
    lines: out,
    subtotal: money(subtotal),
    vat21: money(vat21),
    vat105: money(vat105),
    vat27: money(vat27),
    taxTotal: money(taxTotal),
    perceptionIva: money(new Decimal(extras.perceptionIva)),
    perceptionIibb: money(new Decimal(extras.perceptionIibb)),
    otherTaxes: money(new Decimal(extras.otherTaxes)),
    total: money(total),
  };
}

/** Variación de costo de reposición. */
export function costChange(previous: number, next: number) {
  const prev = new Decimal(previous);
  const nxt = new Decimal(next);
  const delta = nxt.minus(prev);
  return {
    delta: cost4(delta),
    deltaPct: prev.isZero() ? null : delta.div(prev).mul(100).toDecimalPlaces(2).toNumber(),
    increased: delta.gt(0),
  };
}

export interface OpenPayable {
  id: string;
  balance: number;
  dueDate: Date;
}

/**
 * Imputa un pago a los comprobantes elegidos, del vencimiento más antiguo al
 * más nuevo. No permite pagar más que la suma de los saldos.
 */
export function allocatePayment(amount: number, payables: OpenPayable[]): { payableId: string; amount: number }[] {
  let left = new Decimal(amount);
  if (left.lte(0)) throw new PurchasingError("El importe a pagar debe ser mayor a 0");
  const totalOpen = payables.reduce((a, p) => a.plus(p.balance), new Decimal(0));
  if (left.gt(totalOpen)) throw new PurchasingError("El importe supera el saldo de los comprobantes elegidos");
  const out: { payableId: string; amount: number }[] = [];
  for (const p of [...payables].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
    if (left.lte(0)) break;
    const take = Decimal.min(left, p.balance);
    if (take.lte(0)) continue;
    out.push({ payableId: p.id, amount: money(take) });
    left = left.minus(take);
  }
  return out;
}

export const AGING_BUCKETS = ["A_VENCER", "D1_30", "D31_60", "D61_90", "D90_MAS"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export const AGING_LABELS: Record<AgingBucket, string> = {
  A_VENCER: "A vencer",
  D1_30: "1-30 días",
  D31_60: "31-60 días",
  D61_90: "61-90 días",
  D90_MAS: "+90 días",
};

export function agingBucket(dueDate: Date, today = new Date()): AgingBucket {
  const days = Math.floor((startOfDay(today).getTime() - startOfDay(dueDate).getTime()) / 86_400_000);
  if (days <= 0) return "A_VENCER";
  if (days <= 30) return "D1_30";
  if (days <= 60) return "D31_60";
  if (days <= 90) return "D61_90";
  return "D90_MAS";
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function agingSummary(payables: { balance: number; dueDate: Date }[], today = new Date()): Record<AgingBucket, number> {
  const acc = Object.fromEntries(AGING_BUCKETS.map((b) => [b, new Decimal(0)])) as Record<AgingBucket, Decimal>;
  for (const p of payables) {
    const b = agingBucket(p.dueDate, today);
    acc[b] = acc[b].plus(p.balance);
  }
  return Object.fromEntries(AGING_BUCKETS.map((b) => [b, money(acc[b])])) as Record<AgingBucket, number>;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
