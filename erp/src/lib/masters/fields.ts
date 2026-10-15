/**
 * Definición declarativa de campos para los maestros (clientes, productos,
 * proveedores, materiales, talleres). La misma definición se usa para:
 *   - renderizar el formulario de alta / edición,
 *   - validar en el servidor lo que manda el formulario,
 *   - interpretar cada celda de un Excel/CSV importado,
 *   - y armar las columnas de la exportación.
 * Es código puro (sin Prisma) para poder testearlo.
 */

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "number"
  | "int"
  | "select"
  | "multiselect"
  | "bool"
  | "tags"
  | "months"
  | "date"
  | "ref";

export interface Option {
  value: string;
  label: string;
  /** Otras formas de identificar la opción al importar (ej. CUIT de un proveedor). */
  keys?: string[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Largo máximo (texto) */
  max?: number;
  /** Rango numérico */
  minValue?: number;
  maxValue?: number;
  options?: readonly Option[];
  /** Para type "ref": nombre de la lista de opciones que provee el servidor. */
  ref?: string;
  /** Para texto libre: lista de sugerencias que provee el servidor (se puede escribir otro valor). */
  suggest?: string;
  help?: string;
  placeholder?: string;
  /** Ocupa todo el ancho del formulario */
  wide?: boolean;
  /** Encabezados alternativos aceptados al importar */
  aliases?: readonly string[];
  /** Agrupa campos en el formulario */
  section?: string;
  /** Solo para importación / exportación (no aparece en el formulario) */
  importOnly?: boolean;
  defaultValue?: FieldValue;
  /** Fuerza mayúsculas (códigos, SKU) */
  upper?: boolean;
  /** Solo se carga al crear; después se ve pero no se edita desde el formulario */
  createOnly?: boolean;
}

export type FieldValue = string | number | boolean | string[] | number[] | null;
export type Values = Record<string, FieldValue>;
export type RefOptions = Record<string, readonly Option[]>;

export type ParseResult = { ok: true; value: FieldValue } | { ok: false; error: string };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MONTH_OPTIONS: Option[] = MONTHS.map((m, i) => ({ value: String(i + 1), label: m[0].toUpperCase() + m.slice(1) }));

/** Normaliza para comparar: minúsculas, sin acentos, sin espacios/símbolos. */
export const normalizeKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * Interpreta números escritos a la argentina o a la inglesa:
 * "1.234,56", "1234,56", "1,234.56", "1234.56", "$ 2.500", "15%".
 */
export function parseLocaleNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/[$%\s]/g, "").replace(/^ARS/i, "");
  if (!s) return null;
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^[-(]|\)$/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    // Solo comas: "1,5" decimal; "1,234,567" separador de miles.
    s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" o "12.500.000": separador de miles argentino.
    s = s.split(".").join("");
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const TRUE_WORDS = new Set(["si", "s", "true", "verdadero", "1", "x", "activo", "yes", "y"]);
const FALSE_WORDS = new Set(["no", "n", "false", "falso", "0", "inactivo"]);

export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw !== "string") return null;
  const k = normalizeKey(raw);
  if (TRUE_WORDS.has(k)) return true;
  if (FALSE_WORDS.has(k)) return false;
  return null;
}

const splitList = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === "number") return [String(raw)];
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,;|/\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export function matchOption(options: readonly Option[], raw: string): Option | null {
  const k = normalizeKey(raw);
  if (!k) return null;
  return (
    options.find((o) => o.value === raw) ??
    options.find((o) => normalizeKey(o.value) === k || normalizeKey(o.label) === k || o.keys?.some((x) => normalizeKey(x) === k)) ??
    null
  );
}

function matchMonth(raw: string): number | null {
  const n = parseLocaleNumber(raw);
  if (n !== null && Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const k = normalizeKey(raw);
  if (k.length < 3) return null;
  const i = MONTHS.findIndex((m) => m.startsWith(k) || k.startsWith(m.slice(0, 3)));
  return i >= 0 ? i + 1 : null;
}

/** Convierte un valor crudo (formulario o celda de planilla) al tipo del campo. */
export function parseField(field: FieldDef, raw: unknown, refs: RefOptions = {}): ParseResult {
  const label = field.label;
  if (field.type === "bool") {
    if (isBlank(raw)) return { ok: true, value: typeof field.defaultValue === "boolean" ? field.defaultValue : false };
    const b = parseBool(raw);
    return b === null ? { ok: false, error: `${label}: usá Sí o No` } : { ok: true, value: b };
  }
  if (isBlank(raw)) {
    if (field.required) return { ok: false, error: `${label}: es obligatorio` };
    if (field.type === "multiselect" || field.type === "tags" || field.type === "months") return { ok: true, value: [] };
    return { ok: true, value: field.defaultValue ?? null };
  }

  switch (field.type) {
    case "text":
    case "phone":
    case "textarea": {
      let s = String(raw).trim();
      if (field.upper) s = s.toUpperCase();
      if (field.max && s.length > field.max) return { ok: false, error: `${label}: máximo ${field.max} caracteres` };
      return { ok: true, value: s };
    }
    case "email": {
      const s = String(raw).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, error: `${label}: "${s}" no es un email válido` };
      return { ok: true, value: s };
    }
    case "number":
    case "int": {
      const n = parseLocaleNumber(raw);
      if (n === null) return { ok: false, error: `${label}: "${String(raw)}" no es un número` };
      if (field.type === "int" && !Number.isInteger(n)) return { ok: false, error: `${label}: debe ser un número entero` };
      if (field.minValue !== undefined && n < field.minValue) return { ok: false, error: `${label}: mínimo ${field.minValue}` };
      if (field.maxValue !== undefined && n > field.maxValue) return { ok: false, error: `${label}: máximo ${field.maxValue}` };
      return { ok: true, value: n };
    }
    case "date": {
      const iso = parseDateValue(raw);
      if (!iso) return { ok: false, error: `${label}: "${String(raw)}" no es una fecha (usá DD/MM/AAAA)` };
      return { ok: true, value: iso };
    }
    case "select":
    case "ref": {
      const options = field.type === "ref" ? (refs[field.ref ?? ""] ?? []) : (field.options ?? []);
      const o = matchOption(options, String(raw).trim());
      if (!o && field.type === "ref") return { ok: false, error: `${label}: "${String(raw)}" no está cargado (dalo de alta primero o revisá el nombre/CUIT)` };
      if (!o) return { ok: false, error: `${label}: "${String(raw)}" no es una opción válida` };
      return { ok: true, value: o.value };
    }
    case "multiselect": {
      const values: string[] = [];
      for (const part of splitList(raw)) {
        const o = matchOption(field.options ?? [], part);
        if (!o) return { ok: false, error: `${label}: "${part}" no es una opción válida` };
        if (!values.includes(o.value)) values.push(o.value);
      }
      if (field.required && values.length === 0) return { ok: false, error: `${label}: elegí al menos una opción` };
      return { ok: true, value: values };
    }
    case "tags": {
      const tags = [...new Set(splitList(raw).map((t) => t.toLowerCase().replace(/\s+/g, "-")))];
      if (tags.some((t) => t.length > 40)) return { ok: false, error: `${label}: cada etiqueta admite hasta 40 caracteres` };
      return { ok: true, value: tags };
    }
    case "months": {
      const months: number[] = [];
      for (const part of splitList(raw)) {
        const m = matchMonth(part);
        if (m === null) return { ok: false, error: `${label}: "${part}" no es un mes` };
        if (!months.includes(m)) months.push(m);
      }
      return { ok: true, value: months.sort((a, b) => a - b) };
    }
  }
}

/** "31/12/2025", "31-12-25", "2025-12-31" o número de serie de Excel → "2025-12-31". */
export function parseDateValue(raw: unknown): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    // Fecha de Excel guardada como número (días desde 1899-12-30).
    return new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

/** Valida todos los campos (del formulario o de una fila importada). */
export function parseValues(fields: readonly FieldDef[], raw: Record<string, unknown>, refs: RefOptions = {}) {
  const values: Values = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const r = parseField(f, raw[f.key], refs);
    if (r.ok) values[f.key] = r.value;
    else errors[f.key] = r.error;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

/** Valor legible para exportar a planilla (se puede volver a importar tal cual). */
export function formatField(field: FieldDef, value: FieldValue, refs: RefOptions = {}): string | number | null {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case "bool":
      return value ? "Sí" : "No";
    case "number":
    case "int":
      return typeof value === "number" ? value : parseLocaleNumber(String(value));
    case "select":
      return field.options?.find((o) => o.value === value)?.label ?? String(value);
    case "ref": {
      const o = refs[field.ref ?? ""]?.find((x) => x.value === value);
      return o ? (o.keys?.[0] ?? o.label) : null;
    }
    case "multiselect":
      return (value as string[]).map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(", ");
    case "tags":
      return (value as string[]).join(", ");
    case "date": {
      const [y, m, d] = String(value).split("-");
      return d ? `${d}/${m}/${y}` : String(value);
    }
    case "months":
      return (value as number[]).map((m) => MONTH_OPTIONS[m - 1]?.label ?? m).join(", ");
    default:
      return String(value);
  }
}

/**
 * Relaciona los encabezados de la planilla con los campos (por etiqueta,
 * clave o alias, sin importar mayúsculas/acentos). Devuelve índice → campo.
 */
export function mapHeaders(headers: readonly string[], fields: readonly FieldDef[]) {
  const mapping = new Map<number, FieldDef>();
  const used = new Set<string>();
  headers.forEach((h, i) => {
    const k = normalizeKey(h.replace(/\*$/, ""));
    if (!k) return;
    const f = fields.find((x) => !used.has(x.key) && [x.label, x.key, ...(x.aliases ?? [])].some((c) => normalizeKey(c) === k));
    if (f) {
      mapping.set(i, f);
      used.add(f.key);
    }
  });
  const missingRequired = fields.filter((f) => f.required && !used.has(f.key)).map((f) => f.label);
  const ignored = headers.filter((h, i) => h.trim() && !mapping.has(i));
  return { mapping, missingRequired, ignored };
}

/** Encabezado de la columna en la plantilla/exportación (con * si es obligatorio). */
export const columnHeader = (f: FieldDef) => (f.required ? `${f.label}*` : f.label);

// ─── CUIT / CUIL ──────────────────────────────────────────────────────────

/** Verifica el dígito verificador de un CUIT/CUIL (11 dígitos). */
export function isValidCuit(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((a, x, i) => a + x * Number(d[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(d[10]);
}

/** "30700000007" → "30-70000000-7" */
export const formatCuit = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : raw.trim();
};

/** WhatsApp argentino a formato internacional para wa.me: 351 555-1234 → 5493515551234 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("549")) return d.length >= 12 ? d : null;
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  // Quita el "15" de celulares escritos a la antigua (área + 15 + número).
  const m = /^(\d{2,4})15(\d{6,8})$/.exec(d);
  if (m && m[1].length + m[2].length === 10) d = m[1] + m[2];
  return d.length === 10 ? `549${d}` : null;
}
