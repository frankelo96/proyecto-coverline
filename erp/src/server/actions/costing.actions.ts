"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { CostingError } from "@/lib/costing/escandallo";
import {
  saveCostSheetSchema,
  updateMaterialCostSchema,
  updateServiceTariffSchema,
} from "@/lib/validations/cost-sheet";
import { db } from "@/server/db";
import {
  CostingServiceError,
  saveProductCostSheet,
  updateRawMaterialCost,
  updateServiceTariff,
  type RecalculateResult,
} from "@/server/services/costing.service";

export interface RecalcSummary {
  sku: string;
  name: string;
  previousCost: number;
  newCost: number;
  marginAlert: boolean;
}

const summarize = (r: RecalculateResult): RecalcSummary => ({
  sku: r.sku,
  name: r.name,
  previousCost: r.previousCost,
  newCost: r.newCost,
  marginAlert: r.marginAlert,
});

function toError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: "Datos inválidos", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
  }
  if (error instanceof CostingServiceError || error instanceof CostingError) {
    return { ok: false, error: error.message };
  }
  console.error("[costing.actions]", error);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

export async function saveCostSheetAction(raw: unknown): Promise<ActionResult<RecalcSummary>> {
  try {
    const input = saveCostSheetSchema.parse(raw);
    const result = await db.$transaction((tx) => saveProductCostSheet(tx, input));
    revalidatePath("/produccion/fichas");
    revalidatePath(`/produccion/fichas/${input.productId}`);
    return {
      ok: true,
      data: summarize(result),
      message: input.applySuggestedPrice ? "Ficha guardada y precio de lista actualizado" : "Ficha técnica guardada",
    };
  } catch (error) {
    return toError(error);
  }
}

export async function updateMaterialCostAction(raw: unknown): Promise<ActionResult<RecalcSummary[]>> {
  try {
    const input = updateMaterialCostSchema.parse(raw);
    const { affected } = await db.$transaction((tx) =>
      updateRawMaterialCost(tx, { rawMaterialId: input.rawMaterialId, newCost: input.newCost, source: "MANUAL" }),
    );
    revalidatePath("/produccion/fichas", "layout");
    return { ok: true, data: affected.map(summarize), message: `${affected.length} fichas recalculadas` };
  } catch (error) {
    return toError(error);
  }
}

export async function updateServiceTariffAction(raw: unknown): Promise<ActionResult<RecalcSummary[]>> {
  try {
    const input = updateServiceTariffSchema.parse(raw);
    const { affected } = await db.$transaction((tx) =>
      updateServiceTariff(tx, { serviceCostId: input.serviceCostId, newCost: input.newCost }),
    );
    revalidatePath("/produccion/fichas", "layout");
    return { ok: true, data: affected.map(summarize), message: `${affected.length} fichas recalculadas` };
  } catch (error) {
    return toError(error);
  }
}
