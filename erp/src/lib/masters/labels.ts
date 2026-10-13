import type {
  ClientType,
  DocumentType,
  LeadStatus,
  PricingMode,
  ProductCategory,
  ProductSourcing,
  QuoteStatus,
  UnitOfMeasure,
  WorkshopType,
} from "@/generated/prisma/enums";

import type { Option } from "./fields";

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  PARTICULAR: "Particular",
  ESCUELA: "Escuela / colegio",
  EMPRESA: "Empresa",
  CLINICA: "Clínica / salud",
  GASTRONOMICO: "Gastronómico",
  OTRO: "Otro",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = { CUIT: "CUIT", CUIL: "CUIL", DNI: "DNI", PASAPORTE: "Pasaporte" };

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  TRABAJO: "Trabajo",
  ESCOLAR: "Escolar",
  MEDICA: "Médica",
  GASTRONOMICA: "Gastronómica",
  ACCESORIO: "Accesorio",
};

export const SOURCING_LABELS: Record<ProductSourcing, string> = { FABRICADO: "Fabricación propia", REVENTA: "Reventa" };

export const PRICING_MODE_LABELS: Record<PricingMode, string> = { MARKUP: "Recargo sobre costo", MARGIN: "Margen sobre precio" };

export const WORKSHOP_TYPE_LABELS: Record<WorkshopType, string> = {
  CONFECCION: "Confección",
  BORDADO: "Bordado",
  ESTAMPADO: "Estampado",
  SUBLIMACION: "Sublimación",
  PLANCHADO: "Planchado",
};

export const UOM_LABELS: Record<UnitOfMeasure, string> = {
  METRO: "Metro",
  KILOGRAMO: "Kilogramo",
  UNIDAD: "Unidad",
  PAR: "Par",
  CONO: "Cono",
  ROLLO: "Rollo",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  PRESUPUESTADO: "Presupuestado",
  NEGOCIACION: "Negociación",
  GANADO: "Ganado",
  PERDIDO: "Perdido",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  VENCIDO: "Vencido",
};

export const toOptions = <K extends string>(labels: Record<K, string>): Option[] =>
  (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));
