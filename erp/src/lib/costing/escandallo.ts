/**
 * Motor de escandallo (ficha técnica de costos) — puro, sin I/O.
 *
 * Se usa en tres lugares con la misma lógica, para que el número que ve el
 * usuario en el simulador sea exactamente el que se persiste:
 *   1. Componente cliente (simulación en tiempo real).
 *   2. Servicio de costos en el servidor (recálculo y snapshot).
 *   3. Tests unitarios.
 *
 * Toda la aritmética se hace con decimal.js para evitar errores de punto
 * flotante en montos; la salida se redondea a 4 decimales (costos) y
 * 2 decimales (precios) y se expone como `number` serializable a JSON.
 */
import Decimal from "decimal.js";

import type {
  PricingMode,
  RawMaterialType,
  ServiceType,
  UnitOfMeasure,
} from "@/generated/prisma/enums";

export type Numeric = number | string | Decimal | { toString(): string };

export interface MaterialLineInput {
  rawMaterialId?: string | null;
  code?: string | null;
  name: string;
  type: RawMaterialType;
  uom: UnitOfMeasure;
  /** Consumo neto por prenda, en la unidad de medida de la materia prima. */
  quantity: Numeric;
  /** Merma de corte / desperdicio, en %. */
  wastePct: Numeric;
  /** Costo de reposición por unidad de medida. */
  unitCost: Numeric;
}

export interface ServiceLineInput {
  serviceCostId?: string | null;
  name: string;
  type: ServiceType;
  quantity: Numeric;
  unitCost: Numeric;
  unitLabel?: string | null;
}

export interface CostSheetInput {
  materials: MaterialLineInput[];
  services: ServiceLineInput[];
  /** Gastos generales prorrateados sobre el costo directo, en %. */
  overheadPct: Numeric;
  pricingMode: PricingMode;
  /** Markup sobre costo (MARKUP) o margen sobre precio neto (MARGIN), en %. */
  pricingPct: Numeric;
  /** Alícuota de IVA en %. */
  vatRate: Numeric;
  /**
   * Redondeo comercial del precio final con IVA hacia arriba (ej. 100 → $ 18.437 pasa a $ 18.500).
   * 0 o ausente = sin redondeo.
   */
  priceRoundingStep?: Numeric;
  /** Precio de lista neto vigente, para evaluar el margen real. */
  listPrice?: Numeric | null;
  /** Costo vigente en la ficha (para detectar aumentos). */
  baselineCost?: Numeric | null;
}

export const COST_GROUPS = [
  "TELAS",
  "AVIOS",
  "CORTE",
  "CONFECCION",
  "PERSONALIZACION",
  "PLANCHADO_EMPAQUE",
  "LOGISTICA",
  "OTROS",
] as const;
export type CostGroup = (typeof COST_GROUPS)[number];

export const COST_GROUP_LABELS: Record<CostGroup, string> = {
  TELAS: "Telas",
  AVIOS: "Avíos e insumos",
  CORTE: "Corte",
  CONFECCION: "Taller de confección",
  PERSONALIZACION: "Personalización",
  PLANCHADO_EMPAQUE: "Planchado y empaque",
  LOGISTICA: "Fletes y logística",
  OTROS: "Otros",
};

export interface MaterialLineResult {
  rawMaterialId: string | null;
  code: string | null;
  name: string;
  type: RawMaterialType;
  uom: UnitOfMeasure;
  group: CostGroup;
  quantity: number;
  wastePct: number;
  /** Consumo bruto = neto × (1 + merma). */
  grossQuantity: number;
  unitCost: number;
  subtotal: number;
  /** Participación sobre el costo total, en %. */
  sharePct: number;
}

export interface ServiceLineResult {
  serviceCostId: string | null;
  name: string;
  type: ServiceType;
  group: CostGroup;
  quantity: number;
  unitCost: number;
  unitLabel: string | null;
  subtotal: number;
  sharePct: number;
}

export interface CostGroupResult {
  group: CostGroup;
  label: string;
  amount: number;
  sharePct: number;
}

export interface ListPriceCheck {
  listPrice: number;
  /** Margen bruto real al precio de lista vigente, en % sobre precio neto. */
  marginPct: number;
  /** Markup real al precio de lista vigente, en % sobre costo. */
  markupPct: number;
  belowCost: boolean;
  /** Diferencia entre el precio sugerido y el de lista (positivo = hay que subir). */
  gapToSuggested: number;
}

export interface BaselineCheck {
  baselineCost: number;
  delta: number;
  deltaPct: number;
  increased: boolean;
}

export interface CostBreakdown {
  materials: MaterialLineResult[];
  services: ServiceLineResult[];
  groups: CostGroupResult[];
  materialsCost: number;
  servicesCost: number;
  directCost: number;
  overheadPct: number;
  overheadCost: number;
  totalCost: number;
  pricingMode: PricingMode;
  pricingPct: number;
  vatRate: number;
  suggestedNetPrice: number;
  suggestedVat: number;
  suggestedFinalPrice: number;
  /** Markup efectivo sobre costo luego del redondeo, en %. */
  effectiveMarkupPct: number;
  /** Margen bruto efectivo sobre precio neto luego del redondeo, en %. */
  effectiveMarginPct: number;
  listPriceCheck: ListPriceCheck | null;
  baselineCheck: BaselineCheck | null;
}

export class CostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostingError";
  }
}

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

function dec(value: Numeric | null | undefined, field: string): Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  let d: Decimal;
  try {
    d = value instanceof Decimal ? value : new Decimal(value.toString());
  } catch {
    throw new CostingError(`Valor numérico inválido en "${field}": ${String(value)}`);
  }
  if (!d.isFinite()) throw new CostingError(`Valor no finito en "${field}"`);
  return d;
}

function nonNegative(value: Numeric | null | undefined, field: string): Decimal {
  const d = dec(value, field);
  if (d.isNegative()) throw new CostingError(`"${field}" no puede ser negativo`);
  return d;
}

const cost4 = (d: Decimal) => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
const money2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const pct2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

export function materialGroup(type: RawMaterialType): CostGroup {
  switch (type) {
    case "TELA":
      return "TELAS";
    case "AVIO":
    case "INSUMO":
      return "AVIOS";
    case "EMPAQUE":
      return "PLANCHADO_EMPAQUE";
  }
}

export function serviceGroup(type: ServiceType): CostGroup {
  switch (type) {
    case "CORTE":
      return "CORTE";
    case "CONFECCION":
      return "CONFECCION";
    case "BORDADO":
    case "ESTAMPADO":
    case "SUBLIMACION":
      return "PERSONALIZACION";
    case "PLANCHADO":
    case "EMPAQUE":
      return "PLANCHADO_EMPAQUE";
    case "FLETE":
      return "LOGISTICA";
    case "OTRO":
      return "OTROS";
  }
}

/** Precio neto (sin IVA) a partir del costo según el modo de pricing. */
export function priceFromCost(cost: Decimal, mode: PricingMode, pct: Decimal): Decimal {
  if (mode === "MARKUP") return cost.mul(HUNDRED.plus(pct)).div(HUNDRED);
  if (pct.gte(HUNDRED)) throw new CostingError("El margen sobre precio debe ser menor a 100%");
  return cost.mul(HUNDRED).div(HUNDRED.minus(pct));
}

const share = (part: Decimal, total: Decimal) => (total.isZero() ? ZERO : part.div(total).mul(HUNDRED));

export function computeCostSheet(input: CostSheetInput): CostBreakdown {
  const overheadPct = nonNegative(input.overheadPct, "Gastos generales %");
  const pricingPct = nonNegative(input.pricingPct, "Markup / margen %");
  const vatRate = nonNegative(input.vatRate, "IVA %");
  const roundingStep = nonNegative(input.priceRoundingStep, "Redondeo");

  const groupTotals = new Map<CostGroup, Decimal>(COST_GROUPS.map((g) => [g, ZERO]));
  const addToGroup = (g: CostGroup, amount: Decimal) => groupTotals.set(g, groupTotals.get(g)!.plus(amount));

  const materialRows = input.materials.map((m, i) => {
    const label = m.name || `material #${i + 1}`;
    const quantity = nonNegative(m.quantity, `Consumo de ${label}`);
    const wastePct = nonNegative(m.wastePct, `Merma de ${label}`);
    const unitCost = nonNegative(m.unitCost, `Costo de ${label}`);
    const gross = quantity.mul(HUNDRED.plus(wastePct)).div(HUNDRED);
    const subtotal = gross.mul(unitCost);
    const group = materialGroup(m.type);
    addToGroup(group, subtotal);
    return { m, quantity, wastePct, unitCost, gross, subtotal, group };
  });

  const serviceRows = input.services.map((s, i) => {
    const label = s.name || `proceso #${i + 1}`;
    const quantity = nonNegative(s.quantity, `Cantidad de ${label}`);
    const unitCost = nonNegative(s.unitCost, `Tarifa de ${label}`);
    const subtotal = quantity.mul(unitCost);
    const group = serviceGroup(s.type);
    addToGroup(group, subtotal);
    return { s, quantity, unitCost, subtotal, group };
  });

  const materialsCost = materialRows.reduce((acc, r) => acc.plus(r.subtotal), ZERO);
  const servicesCost = serviceRows.reduce((acc, r) => acc.plus(r.subtotal), ZERO);
  const directCost = materialsCost.plus(servicesCost);
  const overheadCost = directCost.mul(overheadPct).div(HUNDRED);
  const totalCost = directCost.plus(overheadCost);

  // Precio sugerido: se calcula sobre el costo total redondeado a 4 decimales,
  // el mismo valor que se persiste en Product.currentCost.
  const roundedCost = totalCost.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  let netPrice = priceFromCost(roundedCost, input.pricingMode, pricingPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const vatFactor = HUNDRED.plus(vatRate).div(HUNDRED);
  let finalPrice = netPrice.mul(vatFactor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (roundingStep.gt(0) && finalPrice.gt(0)) {
    finalPrice = finalPrice.div(roundingStep).ceil().mul(roundingStep);
    netPrice = finalPrice.div(vatFactor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
  const vatAmount = finalPrice.minus(netPrice);

  const effectiveMarkup = roundedCost.isZero() ? ZERO : netPrice.minus(roundedCost).div(roundedCost).mul(HUNDRED);
  const effectiveMargin = netPrice.isZero() ? ZERO : netPrice.minus(roundedCost).div(netPrice).mul(HUNDRED);

  let listPriceCheck: ListPriceCheck | null = null;
  if (input.listPrice !== null && input.listPrice !== undefined) {
    const listPrice = nonNegative(input.listPrice, "Precio de lista");
    if (listPrice.gt(0)) {
      listPriceCheck = {
        listPrice: money2(listPrice),
        marginPct: pct2(listPrice.minus(roundedCost).div(listPrice).mul(HUNDRED)),
        markupPct: roundedCost.isZero() ? 0 : pct2(listPrice.minus(roundedCost).div(roundedCost).mul(HUNDRED)),
        belowCost: listPrice.lt(roundedCost),
        gapToSuggested: money2(netPrice.minus(listPrice)),
      };
    }
  }

  let baselineCheck: BaselineCheck | null = null;
  if (input.baselineCost !== null && input.baselineCost !== undefined) {
    const baseline = nonNegative(input.baselineCost, "Costo vigente");
    if (baseline.gt(0)) {
      const delta = roundedCost.minus(baseline);
      baselineCheck = {
        baselineCost: cost4(baseline),
        delta: cost4(delta),
        deltaPct: pct2(delta.div(baseline).mul(HUNDRED)),
        increased: delta.gt(0),
      };
    }
  }

  return {
    materials: materialRows.map((r) => ({
      rawMaterialId: r.m.rawMaterialId ?? null,
      code: r.m.code ?? null,
      name: r.m.name,
      type: r.m.type,
      uom: r.m.uom,
      group: r.group,
      quantity: cost4(r.quantity),
      wastePct: pct2(r.wastePct),
      grossQuantity: cost4(r.gross),
      unitCost: cost4(r.unitCost),
      subtotal: cost4(r.subtotal),
      sharePct: pct2(share(r.subtotal, totalCost)),
    })),
    services: serviceRows.map((r) => ({
      serviceCostId: r.s.serviceCostId ?? null,
      name: r.s.name,
      type: r.s.type,
      group: r.group,
      quantity: cost4(r.quantity),
      unitCost: cost4(r.unitCost),
      unitLabel: r.s.unitLabel ?? null,
      subtotal: cost4(r.subtotal),
      sharePct: pct2(share(r.subtotal, totalCost)),
    })),
    groups: COST_GROUPS.map((g) => {
      const amount = groupTotals.get(g)!;
      return { group: g, label: COST_GROUP_LABELS[g], amount: cost4(amount), sharePct: pct2(share(amount, totalCost)) };
    }).filter((g) => g.amount > 0),
    materialsCost: cost4(materialsCost),
    servicesCost: cost4(servicesCost),
    directCost: cost4(directCost),
    overheadPct: pct2(overheadPct),
    overheadCost: cost4(overheadCost),
    totalCost: cost4(totalCost),
    pricingMode: input.pricingMode,
    pricingPct: pct2(pricingPct),
    vatRate: pct2(vatRate),
    suggestedNetPrice: money2(netPrice),
    suggestedVat: money2(vatAmount),
    suggestedFinalPrice: money2(finalPrice),
    effectiveMarkupPct: pct2(effectiveMarkup),
    effectiveMarginPct: pct2(effectiveMargin),
    listPriceCheck,
    baselineCheck,
  };
}

/**
 * Aplica una variación porcentual a los costos unitarios de las líneas que
 * cumplan el filtro (ej. "+15% en todas las telas") para simular escenarios
 * de reposición sin tocar la ficha original.
 */
export function applyMaterialPriceShock<T extends MaterialLineInput>(
  lines: T[],
  pct: Numeric,
  predicate: (line: T) => boolean = () => true,
): T[] {
  const factor = HUNDRED.plus(dec(pct, "Variación %")).div(HUNDRED);
  if (factor.isNegative()) throw new CostingError("La variación no puede bajar el costo por debajo de cero");
  return lines.map((l) =>
    predicate(l) ? { ...l, unitCost: cost4(dec(l.unitCost, l.name).mul(factor)) } : l,
  );
}
