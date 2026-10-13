import type { RawMaterialType, ServiceType, UnitOfMeasure } from "@/generated/prisma/enums";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const arsRound = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });
const pct = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export const formatMoney = (value: number, opts?: { round?: boolean }) =>
  (opts?.round ? arsRound : ars).format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number) => num.format(Number.isFinite(value) ? value : 0);

export const formatPct = (value: number) => `${pct.format(Number.isFinite(value) ? value : 0)}%`;

export const UOM_SHORT: Record<UnitOfMeasure, string> = {
  METRO: "m",
  KILOGRAMO: "kg",
  UNIDAD: "u",
  PAR: "par",
  CONO: "cono",
  ROLLO: "rollo",
};

export const MATERIAL_TYPE_LABELS: Record<RawMaterialType, string> = {
  TELA: "Tela",
  AVIO: "Avío",
  EMPAQUE: "Empaque",
  INSUMO: "Insumo",
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  CORTE: "Corte",
  CONFECCION: "Confección",
  BORDADO: "Bordado",
  ESTAMPADO: "Estampado",
  SUBLIMACION: "Sublimación",
  PLANCHADO: "Planchado",
  EMPAQUE: "Empaque",
  FLETE: "Flete",
  OTRO: "Otro",
};
