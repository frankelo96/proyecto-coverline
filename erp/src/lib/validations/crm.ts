import { z } from "zod";

import { LeadStatus, QuoteStatus } from "@/generated/prisma/enums";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida");

export const quoteItemSchema = z.object({
  productId: z.string().nullable(),
  description: z.string().trim().min(1, "Cada ítem necesita una descripción").max(300),
  quantity: z.number({ error: "Cantidad inválida" }).finite().gt(0, "La cantidad debe ser mayor a cero").max(1_000_000),
  unitPrice: z.number({ error: "Precio inválido" }).finite().min(0, "El precio no puede ser negativo").max(1_000_000_000),
  discountPct: z.number({ error: "Bonificación inválida" }).finite().min(0).max(100, "La bonificación no puede superar el 100%"),
  vatRate: z.union([z.literal(21), z.literal(10.5), z.literal(27), z.literal(0)]),
});

export const quoteSchema = z
  .object({
    id: z.string().nullable(),
    clientId: z.string().nullable(),
    leadId: z.string().nullable(),
    validUntil: isoDate,
    paymentTerms: optText(500),
    deliveryTerms: optText(500),
    notes: optText(2000),
    items: z.array(quoteItemSchema).min(1, "Agregá al menos un ítem").max(200),
  })
  .refine((v) => v.clientId || v.leadId, { message: "Elegí un cliente o una oportunidad", path: ["clientId"] });

export type QuoteInput = z.infer<typeof quoteSchema>;

export const quoteStatusSchema = z.object({ id: z.string().min(1), status: z.enum(QuoteStatus) });

export const leadSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(2, "Ingresá el nombre del contacto").max(160),
  company: optText(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .nullable()
    .transform((s) => (s ? s : null))
    .refine((s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "Email inválido"),
  phone: optText(40),
  source: optText(80),
  status: z.enum(LeadStatus),
  estimatedValue: z.number().finite().min(0).max(10_000_000_000).nullable(),
  expectedClose: isoDate.nullable(),
  notes: optText(4000),
  lostReason: optText(500),
  clientId: z.string().nullable(),
  ownerId: z.string().nullable(),
});

export type LeadInput = z.infer<typeof leadSchema>;

export const leadStatusSchema = z.object({ id: z.string().min(1), status: z.enum(LeadStatus), lostReason: optText(500).optional() });

export const LEAD_SOURCES = ["Recomendación", "Instagram", "Facebook", "WhatsApp", "Google", "Web", "Visita al local", "Licitación", "Cliente existente", "Otro"];

/** "S:10, M:25 L=20" → { S: 10, M: 25, L: 20 } */
export function parseSizeCurve(raw: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const part of raw.split(/[,;\n]+/)) {
    const m = /^\s*([A-Za-z0-9]+)\s*[:=x]\s*(\d+)\s*$/.exec(part);
    if (!m) {
      if (part.trim()) return null;
      continue;
    }
    out[m[1].toUpperCase()] = Number(m[2]);
  }
  return out;
}

export const designSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(2, "Ingresá un nombre para el diseño").max(120),
  colors: z.string().trim().max(300),
  stitchCount: z.number().int().min(0).max(10_000_000).nullable(),
  sizeCurve: z
    .string()
    .trim()
    .max(500)
    .refine((s) => !s || parseSizeCurve(s) !== null, "Curva de talles: usá el formato S:10, M:25, L:20"),
  vectorLogoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((s) => !s || /^https?:\/\//.test(s), "El link debe empezar con http:// o https://"),
  notes: optText(1000),
});

export type DesignInput = z.infer<typeof designSchema>;
