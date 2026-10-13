"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { ENTITIES, isEntityKey } from "@/lib/masters/definitions";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { ADAPTERS } from "@/server/masters/adapters";
import { commitImport, type ImportOutcome, type ImportPreview, previewImport, saveMaster } from "@/server/masters/service";
import { readSpreadsheet, SpreadsheetError } from "@/server/masters/spreadsheet";

function fail(e: unknown, scope: string): ActionResult<never> {
  if (e instanceof AuthorizationError || e instanceof SpreadsheetError) return { ok: false, error: e.message };
  console.error(`[masters.actions] ${scope}`, e);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

function revalidate(entity: string) {
  revalidatePath("/maestros", "layout");
  revalidatePath("/crm", "layout");
  if (entity === "productos" || entity === "materiales") revalidatePath("/produccion", "layout");
  if (entity === "proveedores" || entity === "talleres") revalidatePath("/compras", "layout");
}

export async function saveMasterAction(entity: string, id: string | null, raw: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  try {
    if (!isEntityKey(entity)) return { ok: false, error: "Sección inexistente" };
    const def = ENTITIES[entity];
    const user = await requireActionUser(def.writePermission);
    const r = await saveMaster(entity, id, raw, user.id);
    if (!r.ok) return r;
    revalidate(entity);
    return { ok: true, data: { id: r.id }, message: `${def.singular[0].toUpperCase()}${def.singular.slice(1)} ${id ? "actualizado" : "creado"}` };
  } catch (e) {
    return fail(e, "save");
  }
}

export async function setMasterActiveAction(entity: string, id: string, active: boolean): Promise<ActionResult> {
  try {
    if (!isEntityKey(entity)) return { ok: false, error: "Sección inexistente" };
    await requireActionUser(ENTITIES[entity].writePermission);
    await ADAPTERS[entity].setActive(id, active);
    revalidate(entity);
    return { ok: true, data: undefined, message: active ? "Reactivado" : "Desactivado: ya no aparece en las búsquedas ni en el POS" };
  } catch (e) {
    return fail(e, "active");
  }
}

/** Sin `commit` analiza el archivo y devuelve la vista previa; con `commit` importa las filas válidas. */
export async function importMasterAction(
  formData: FormData,
): Promise<ActionResult<{ preview: ImportPreview } | { outcome: ImportOutcome }>> {
  try {
    const entity = String(formData.get("entity") ?? "");
    if (!isEntityKey(entity)) return { ok: false, error: "Sección inexistente" };
    const user = await requireActionUser(ENTITIES[entity].writePermission);
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Elegí un archivo" };
    const rows = await readSpreadsheet(file);
    if (formData.get("commit") !== "1") return { ok: true, data: { preview: await previewImport(entity, rows) } };
    const outcome = await commitImport(entity, rows, user.id);
    revalidate(entity);
    const msg = `Importación terminada: ${outcome.created} nuevos, ${outcome.updated} actualizados${outcome.failed.length ? `, ${outcome.failed.length} filas con error` : ""}`;
    return { ok: true, data: { outcome }, message: msg };
  } catch (e) {
    return fail(e, "import");
  }
}
