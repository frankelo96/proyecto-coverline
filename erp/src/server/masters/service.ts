import "server-only";

import { type EntityKey, ENTITIES, formFields } from "@/lib/masters/definitions";
import { mapHeaders, parseValues, type Values } from "@/lib/masters/fields";
import { db } from "@/server/db";

import { ADAPTERS, MasterError, UNIQUE_LABELS, uniqueMessage } from "./adapters";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Alta o edición desde el formulario. */
export async function saveMaster(entity: EntityKey, id: string | null, raw: Record<string, unknown>, userId: string): Promise<SaveResult> {
  const def = ENTITIES[entity];
  const adapter = ADAPTERS[entity];
  const refs = await adapter.refs();
  const parsed = parseValues(formFields(def), raw, refs);
  if (!parsed.ok) {
    return {
      ok: false,
      error: "Revisá los campos marcados",
      fieldErrors: Object.fromEntries(Object.entries(parsed.errors).map(([k, v]) => [k, [v]])),
    };
  }
  try {
    const values = adapter.normalize(parsed.values);
    const savedId = await db.$transaction((tx) => adapter.save(tx, id, values, userId), { timeout: 30_000 });
    return { ok: true, id: savedId };
  } catch (e) {
    if (e instanceof MasterError) return { ok: false, error: e.message, fieldErrors: e.field ? { [e.field]: [e.message] } : undefined };
    const unique = uniqueMessage(e, UNIQUE_LABELS[entity]);
    if (unique) return { ok: false, error: unique };
    throw e;
  }
}

export interface ImportRowPreview {
  line: number;
  label: string;
  action: "CREAR" | "ACTUALIZAR" | "ERROR";
  errors: string[];
}

export interface ImportPreview {
  columns: { header: string; field: string | null }[];
  missingRequired: string[];
  rows: ImportRowPreview[];
  total: number;
  toCreate: number;
  toUpdate: number;
  withErrors: number;
}

export interface ImportOutcome {
  created: number;
  updated: number;
  failed: { line: number; error: string }[];
}

interface PreparedRow {
  line: number;
  values: Values | null;
  errors: string[];
}

async function prepare(entity: EntityKey, rows: unknown[][]) {
  const def = ENTITIES[entity];
  const adapter = ADAPTERS[entity];
  const headers = rows[0].map((h) => (h === null ? "" : String(h)));
  const { mapping, missingRequired } = mapHeaders(headers, def.fields);
  const refs = await adapter.refs();
  const prepared: PreparedRow[] = rows.slice(1).map((cells, i) => {
    const raw: Record<string, unknown> = {};
    for (const [idx, f] of mapping) raw[f.key] = cells[idx];
    // Solo se validan las columnas presentes; las ausentes toman su valor por defecto.
    const present = def.fields.filter((f) => [...mapping.values()].includes(f) || f.required);
    const parsed = parseValues(present, raw, refs);
    const errors = Object.values(parsed.errors);
    let values: Values | null = null;
    if (errors.length === 0) {
      try {
        values = adapter.normalize(withDefaults(def.fields, parsed.values));
      } catch (e) {
        if (e instanceof MasterError) errors.push(e.message);
        else throw e;
      }
    }
    return { line: i + 2, values, errors };
  });
  return { headers, mapping, missingRequired, prepared, presentKeys: new Set([...mapping.values()].map((f) => f.key)) };
}

function withDefaults(fields: typeof ENTITIES.clientes.fields, values: Values): Values {
  const out: Values = { ...values };
  for (const f of fields) if (!(f.key in out)) out[f.key] = f.defaultValue ?? (f.type === "tags" || f.type === "multiselect" || f.type === "months" ? [] : null);
  return out;
}

/** Al actualizar, las columnas que no vinieron en el archivo conservan el valor actual. */
async function mergeWithExisting(entity: EntityKey, id: string, values: Values, presentKeys: Set<string>): Promise<Values> {
  const current = await ADAPTERS[entity].get(id);
  if (!current) return values;
  const merged: Values = { ...current };
  for (const k of Object.keys(values)) if (presentKeys.has(k) || !(k in current)) merged[k] = values[k];
  return merged;
}

export async function previewImport(entity: EntityKey, rows: unknown[][]): Promise<ImportPreview> {
  const adapter = ADAPTERS[entity];
  const { headers, mapping, missingRequired, prepared } = await prepare(entity, rows);
  const seen = new Set<string>();
  const previews: ImportRowPreview[] = [];
  for (const r of prepared) {
    if (!r.values || missingRequired.length) {
      previews.push({ line: r.line, label: "", action: "ERROR", errors: missingRequired.length ? [`Faltan columnas: ${missingRequired.join(", ")}`] : r.errors });
      continue;
    }
    const key = adapter.batchKey(r.values);
    const label = rowLabel(entity, r.values);
    if (key && seen.has(key)) {
      previews.push({ line: r.line, label, action: "ERROR", errors: ["Fila repetida en el archivo (mismo identificador que una fila anterior)"] });
      continue;
    }
    if (key) seen.add(key);
    const existing = await adapter.findExisting(db, r.values);
    previews.push({ line: r.line, label, action: existing ? "ACTUALIZAR" : "CREAR", errors: [] });
  }
  // Productos: varias filas del mismo SKU (una por talle) crean un único producto.
  if (entity === "productos") {
    const skus = new Set<string>();
    for (const p of previews) {
      if (p.action !== "CREAR") continue;
      const sku = p.label.split(" · ")[0];
      if (skus.has(sku)) p.action = "ACTUALIZAR";
      skus.add(sku);
    }
  }
  return {
    columns: headers.map((h, i) => ({ header: h, field: mapping.get(i)?.label ?? null })),
    missingRequired,
    rows: previews,
    total: previews.length,
    toCreate: previews.filter((p) => p.action === "CREAR").length,
    toUpdate: previews.filter((p) => p.action === "ACTUALIZAR").length,
    withErrors: previews.filter((p) => p.action === "ERROR").length,
  };
}

/** Importa las filas válidas; cada fila va en su propia transacción y los errores se informan por línea. */
export async function commitImport(entity: EntityKey, rows: unknown[][], userId: string): Promise<ImportOutcome> {
  const adapter = ADAPTERS[entity];
  const { missingRequired, prepared, presentKeys } = await prepare(entity, rows);
  if (missingRequired.length) return { created: 0, updated: 0, failed: [{ line: 1, error: `Faltan columnas obligatorias: ${missingRequired.join(", ")}` }] };
  const outcome: ImportOutcome = { created: 0, updated: 0, failed: [] };
  const seen = new Set<string>();
  for (const r of prepared) {
    if (!r.values) {
      outcome.failed.push({ line: r.line, error: r.errors.join(" · ") });
      continue;
    }
    const key = adapter.batchKey(r.values);
    if (key && seen.has(key)) {
      outcome.failed.push({ line: r.line, error: "Fila repetida en el archivo" });
      continue;
    }
    if (key) seen.add(key);
    try {
      const values = r.values;
      await db.$transaction(
        async (tx) => {
          const existing = await adapter.findExisting(tx, values);
          const data = existing ? await mergeWithExisting(entity, existing, values, presentKeys) : values;
          await adapter.save(tx, existing, data, userId, { fromImport: true });
          if (existing) outcome.updated++;
          else outcome.created++;
        },
        { timeout: 30_000 },
      );
    } catch (e) {
      const msg = e instanceof MasterError ? e.message : (uniqueMessage(e, UNIQUE_LABELS[entity]) ?? null);
      if (!msg) console.error("[import]", entity, r.line, e);
      outcome.failed.push({ line: r.line, error: msg ?? "Error inesperado al guardar la fila" });
    }
  }
  return outcome;
}

function rowLabel(entity: EntityKey, v: Values): string {
  switch (entity) {
    case "clientes":
      return [v.businessName, v.documentNumber].filter(Boolean).join(" · ");
    case "productos":
      return [v.sku, v.name, v.size ? `talle ${v.size}${v.color ? ` ${v.color}` : ""}${v.fabric ? ` ${v.fabric}` : ""}` : null].filter(Boolean).join(" · ");
    case "materiales":
      return `${v.code} · ${v.name}`;
    case "proveedores":
      return [v.businessName, v.cuit].filter(Boolean).join(" · ");
    case "talleres":
      return String(v.name);
    case "saldos-clientes":
    case "saldos-proveedores":
      return `${v.description} · $ ${Number(v.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
  }
}
