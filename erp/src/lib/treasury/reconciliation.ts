/**
 * Conciliación de cuentas: lectura del extracto bancario / de Mercado Pago y
 * emparejamiento con los movimientos registrados en el sistema. Código puro.
 */
import { parseCsv } from "@/lib/masters/csv";

export interface StatementLine {
  /** Fila del archivo (para mostrar y referenciar) */
  row: number;
  date: string; // AAAA-MM-DD
  description: string;
  /** Positivo: entra; negativo: sale */
  amount: number;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "1.234,56" / "-1234.56" / "$ 1.234" / "(1.234,56)" → número. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/\$|\s/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  // Coma decimal (formato argentino) si la última coma va después del último punto.
  if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** "15/10/2026", "15-10-26", "2026-10-15", "2026-10-15T10:00:00" → "2026-10-15". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const DATE_COLS = ["fecha", "fecha de origen", "fecha de liberacion", "fecha operacion", "date"];
const DESC_COLS = ["descripcion", "concepto", "detalle", "referencia", "description", "tipo de operacion"];
const AMOUNT_COLS = ["importe", "monto", "monto neto", "valor", "amount", "importe neto acreditado", "net_credit_amount"];
const DEBIT_COLS = ["debito", "debitos", "egreso", "debe"];
const CREDIT_COLS = ["credito", "creditos", "ingreso", "haber"];

/**
 * Lee el extracto: busca la fila de encabezados (fecha, descripción e importe, o
 * débito/crédito por separado) y devuelve las líneas con importe distinto de cero.
 */
export function parseStatement(text: string): { lines: StatementLine[]; error: string | null } {
  return parseStatementRows(parseCsv(text.replace(/^\uFEFF/, "")));
}

/** Igual que parseStatement, para filas ya leídas (Excel o CSV). Las fechas pueden venir como Date. */
export function parseStatementRows(raw: unknown[][]): { lines: StatementLine[]; error: string | null } {
  const rows = raw.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null || c === undefined ? "" : String(c))));
  if (rows.length === 0) return { lines: [], error: "El archivo está vacío" };
  const find = (header: string[], names: string[]) => header.findIndex((h) => names.includes(norm(h)));
  let headerIdx = -1;
  let cols = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const h = rows[i];
    const c = { date: find(h, DATE_COLS), desc: find(h, DESC_COLS), amount: find(h, AMOUNT_COLS), debit: find(h, DEBIT_COLS), credit: find(h, CREDIT_COLS) };
    if (c.date >= 0 && (c.amount >= 0 || (c.debit >= 0 && c.credit >= 0))) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx < 0) return { lines: [], error: "No se encontraron las columnas Fecha e Importe (o Débito y Crédito)" };
  const lines: StatementLine[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[cols.date] ?? "");
    if (!date) continue;
    let amount: number | null;
    if (cols.amount >= 0) amount = parseAmount(r[cols.amount] ?? "");
    else amount = (parseAmount(r[cols.credit] ?? "") ?? 0) - Math.abs(parseAmount(r[cols.debit] ?? "") ?? 0);
    if (amount === null || Math.abs(amount) < 0.005) continue;
    lines.push({ row: i + 1, date, description: (cols.desc >= 0 ? r[cols.desc] : "")?.trim() ?? "", amount: Math.round(amount * 100) / 100 });
  }
  return { lines, error: lines.length ? null : "No se encontraron movimientos con fecha e importe" };
}

export interface SystemMovement {
  id: string;
  date: string; // AAAA-MM-DD
  amount: number; // con signo
  concept: string;
}

const days = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000;

/**
 * Empareja cada línea del extracto con un movimiento del mismo importe (al centavo)
 * dentro de ±maxDays días, eligiendo el más cercano en fecha. Cada movimiento se usa una vez.
 */
export function matchStatement(lines: StatementLine[], movements: SystemMovement[], maxDays = 5) {
  const used = new Set<string>();
  const matches: { line: StatementLine; movement: SystemMovement }[] = [];
  const unmatchedLines: StatementLine[] = [];
  // Primero las líneas con menos candidatos, para no robarle el par a otra.
  const candidates = (l: StatementLine) => movements.filter((m) => !used.has(m.id) && Math.abs(m.amount - l.amount) < 0.005 && days(m.date, l.date) <= maxDays);
  const order = [...lines].sort((a, b) => candidates(a).length - candidates(b).length);
  for (const l of order) {
    const best = candidates(l).sort((a, b) => days(a.date, l.date) - days(b.date, l.date))[0];
    if (best) {
      used.add(best.id);
      matches.push({ line: l, movement: best });
    } else unmatchedLines.push(l);
  }
  return {
    matches: matches.sort((a, b) => a.line.row - b.line.row),
    unmatchedLines: unmatchedLines.sort((a, b) => a.row - b.row),
    unmatchedMovements: movements.filter((m) => !used.has(m.id)),
  };
}

/** Sugerencia de categoría para una línea que solo está en el banco (comisiones, impuestos…). */
export function suggestCategory(description: string, categories: { id: string; name: string }[]): string | null {
  const d = norm(description);
  const byName = (re: RegExp) => categories.find((c) => re.test(norm(c.name)))?.id ?? null;
  if (/comision|mantenimiento|cargo|costo de servicio|tarifa/.test(d)) return byName(/bancari/);
  if (/impuesto|ley 25\.?413|debitos y creditos|iibb|sircreb|percepcion|retencion|iva/.test(d)) return byName(/impuest/);
  return null;
}
