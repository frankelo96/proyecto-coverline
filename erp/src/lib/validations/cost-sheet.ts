import { z } from "zod";

import {
  PricingMode,
  RawMaterialType,
  ServiceType,
  UnitOfMeasure,
} from "@/generated/prisma/enums";

const amount = (label: string) =>
  z
    .number({ error: `${label}: ingresá un número` })
    .finite(`${label}: valor inválido`)
    .min(0, `${label}: no puede ser negativo`);

export const materialLineSchema = z.object({
  rawMaterialId: z.string().min(1, "Elegí una materia prima"),
  code: z.string().nullable(),
  name: z.string().min(1),
  type: z.enum(RawMaterialType),
  uom: z.enum(UnitOfMeasure),
  quantity: amount("Consumo").positive("El consumo debe ser mayor a 0"),
  wastePct: amount("Merma").max(100, "La merma no puede superar 100%"),
  unitCost: amount("Costo unitario"),
  notes: z.string().max(500).nullable(),
});

export const serviceLineSchema = z.object({
  serviceCostId: z.string().min(1, "Elegí un proceso"),
  name: z.string().min(1),
  type: z.enum(ServiceType),
  unitLabel: z.string().nullable(),
  quantity: amount("Cantidad").positive("La cantidad debe ser mayor a 0"),
  unitCost: amount("Tarifa"),
  notes: z.string().max(500).nullable(),
});

export const costSheetFormSchema = z
  .object({
    materials: z.array(materialLineSchema),
    services: z.array(serviceLineSchema),
    overheadPct: amount("Gastos generales").max(500),
    pricingMode: z.enum(PricingMode),
    pricingPct: amount("Markup / margen").max(1000),
    vatRate: amount("IVA").max(100),
    priceRoundingStep: amount("Redondeo").max(100000),
    /** Simulación: variación % aplicada a todas las telas (no se persiste). */
    fabricShockPct: z.number().finite().min(-90).max(300),
  })
  .superRefine((v, ctx) => {
    if (v.pricingMode === "MARGIN" && v.pricingPct >= 100) {
      ctx.addIssue({ code: "custom", path: ["pricingPct"], message: "El margen debe ser menor a 100%" });
    }
    const dupMaterial = findDuplicate(v.materials.map((m) => m.rawMaterialId));
    if (dupMaterial !== null) {
      ctx.addIssue({ code: "custom", path: ["materials", dupMaterial, "rawMaterialId"], message: "Materia prima repetida" });
    }
    const dupService = findDuplicate(v.services.map((s) => s.serviceCostId));
    if (dupService !== null) {
      ctx.addIssue({ code: "custom", path: ["services", dupService, "serviceCostId"], message: "Proceso repetido" });
    }
  });

function findDuplicate(ids: string[]): number | null {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue;
    if (seen.has(ids[i])) return i;
    seen.add(ids[i]);
  }
  return null;
}

export type CostSheetFormValues = z.infer<typeof costSheetFormSchema>;

/**
 * Payload que persiste la ficha técnica. Los costos unitarios NO se envían:
 * el servidor siempre usa los precios de reposición vigentes de la base.
 */
export const saveCostSheetSchema = z.object({
  productId: z.string().min(1),
  materials: z
    .array(
      z.object({
        rawMaterialId: z.string().min(1),
        quantity: z.number().finite().positive(),
        wastePct: z.number().finite().min(0).max(100),
        notes: z.string().max(500).nullable(),
      }),
    )
    .max(100),
  services: z
    .array(
      z.object({
        serviceCostId: z.string().min(1),
        quantity: z.number().finite().positive(),
        notes: z.string().max(500).nullable(),
      }),
    )
    .max(50),
  overheadPct: z.number().finite().min(0).max(500),
  pricingMode: z.enum(PricingMode),
  pricingPct: z.number().finite().min(0).max(1000),
  vatRate: z.number().finite().min(0).max(100),
  /** Si true, actualiza también el precio de lista con el sugerido. */
  applySuggestedPrice: z.boolean(),
  priceRoundingStep: z.number().finite().min(0).max(100000),
});

export type SaveCostSheetInput = z.infer<typeof saveCostSheetSchema>;

export const updateMaterialCostSchema = z.object({
  rawMaterialId: z.string().min(1),
  newCost: z.number().finite().min(0),
});

export const updateServiceTariffSchema = z.object({
  serviceCostId: z.string().min(1),
  newCost: z.number().finite().min(0),
});
