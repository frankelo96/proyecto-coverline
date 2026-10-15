"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { saveInstallmentPlans } from "@/server/services/settings.service";
import { confirmReconciliation, previewReconciliation } from "@/server/services/reconciliation.service";
import { TreasuryError } from "@/lib/treasury/cash";
import { parseStatementRows } from "@/lib/treasury/reconciliation";
import { readSpreadsheet, SpreadsheetError } from "@/server/masters/spreadsheet";

const categorySchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(3, "Poné un nombre (mínimo 3 letras)").max(80),
  fixed: z.boolean(),
  active: z.boolean(),
});

/** Alta o edición de una categoría de gasto. */
export async function saveExpenseCategoryAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.cashManage);
    const input = categorySchema.parse(raw);
    const dup = await db.expenseCategory.findFirst({ where: { name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
    if (dup) return { ok: false, error: `Ya existe la categoría "${dup.name}"` };
    const data = { name: input.name, fixed: input.fixed, active: input.active };
    const saved = input.id ? await db.expenseCategory.update({ where: { id: input.id }, data }) : await db.expenseCategory.create({ data: { ...data, sortOrder: 50 } });
    await db.auditLog.create({ data: { userId: user.id, entity: "ExpenseCategory", entityId: saved.id, action: input.id ? "UPDATE" : "CREATE", data: input } });
    revalidatePath("/tesoreria", "layout");
    return { ok: true, data: undefined, message: `Categoría "${saved.name}" guardada` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[finance.actions]", e);
    return { ok: false, error: "No se pudo guardar la categoría" };
  }
}

const priceUpdateSchema = z.object({
  reason: z.string().trim().min(3, "Indicá el motivo (ej. aumento de marzo)").max(200),
  items: z
    .array(z.object({ productId: z.string().min(1), expected: z.number().finite().min(0), listPrice: z.number().finite().positive().max(1e10) }))
    .min(1, "Elegí al menos un producto")
    .max(5000),
});

/** Actualización masiva del precio de lista (neto). Si alguien cambió un precio mientras tanto, ese producto se saltea. */
export async function applyPriceUpdateAction(raw: unknown): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.mastersWrite);
    const input = priceUpdateSchema.parse(raw);
    const r = await db.$transaction(
      async (tx) => {
        let updated = 0;
        let skipped = 0;
        for (const i of input.items) {
          const n = await tx.product.updateMany({ where: { id: i.productId, listPrice: i.expected }, data: { listPrice: i.listPrice } });
          if (n.count) updated++;
          else skipped++;
        }
        await tx.auditLog.create({ data: { userId: user.id, entity: "Product", entityId: "precios", action: "PRICE_UPDATE", reason: input.reason, data: { updated, skipped, items: input.items } } });
        return { updated, skipped };
      },
      { timeout: 60_000 },
    );
    revalidatePath("/maestros", "layout");
    revalidatePath("/pos", "layout");
    return {
      ok: true,
      data: r,
      message: `Precios actualizados: ${r.updated} productos${r.skipped ? ` (${r.skipped} se saltearon porque su precio cambió mientras tanto)` : ""}. Si usás la tienda web con precios sincronizados, se actualizan en la próxima sincronización.`,
    };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[finance.actions] prices", e);
    return { ok: false, error: "No se pudieron actualizar los precios" };
  }
}

/** Planes de cuotas con recargo que ofrece el POS. */
export async function saveInstallmentPlansAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.cashManage);
    const plans = z
      .array(z.object({ installments: z.number().int().min(1).max(36), surchargePct: z.number().finite().min(0, "El recargo no puede ser negativo").max(200) }))
      .max(12)
      .parse(raw);
    await saveInstallmentPlans(plans);
    await db.auditLog.create({ data: { userId: user.id, entity: "AppSetting", entityId: "pos.installmentPlans", action: "UPDATE", data: plans } });
    revalidatePath("/tesoreria", "layout");
    revalidatePath("/pos", "layout");
    return { ok: true, data: undefined, message: "Planes de cuotas guardados" };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[finance.actions] plans", e);
    return { ok: false, error: "No se pudieron guardar los planes" };
  }
}

const statementLineSchema = z.object({ row: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().max(300), amount: z.number().finite() });

/** Lee el extracto (Excel o CSV del banco / Mercado Pago) y lo empareja con los movimientos de la cuenta. */
export async function previewReconciliationAction(form: FormData): Promise<ActionResult<Awaited<ReturnType<typeof previewReconciliation>>>> {
  try {
    await requireActionUser(PERMISSIONS.cashManage);
    const registerId = z.string().min(1, "Elegí la cuenta").parse(form.get("registerId"));
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Elegí el archivo del extracto" };
    const parsed = parseStatementRows(await readSpreadsheet(file));
    if (parsed.error) return { ok: false, error: parsed.error };
    return { ok: true, data: await previewReconciliation(registerId, parsed.lines) };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof TreasuryError || e instanceof AuthorizationError || e instanceof SpreadsheetError) return { ok: false, error: e.message };
    console.error("[finance.actions] reconcile preview", e);
    return { ok: false, error: "No se pudo leer el extracto" };
  }
}

export async function confirmReconciliationAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.cashManage);
    const input = z
      .object({
        registerId: z.string().min(1),
        matches: z.array(z.object({ movementId: z.string().min(1), row: z.number().int(), description: z.string().max(300) })).max(5000),
        creates: z.array(statementLineSchema.extend({ categoryId: z.string().nullable() })).max(5000),
      })
      .parse(raw);
    const r = await db.$transaction((tx) => confirmReconciliation(tx, input, user.id), { timeout: 60_000 });
    revalidatePath("/tesoreria", "layout");
    return { ok: true, data: undefined, message: `${r.name}: ${r.matched} movimientos conciliados${r.created ? ` y ${r.created} registrados desde el extracto` : ""}` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof TreasuryError || e instanceof AuthorizationError) return { ok: false, error: e.message };
    console.error("[finance.actions] reconcile", e);
    return { ok: false, error: "No se pudo registrar la conciliación" };
  }
}
