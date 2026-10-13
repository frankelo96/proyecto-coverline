import "server-only";

import ExcelJS from "exceljs";

import { toCsv, parseCsv } from "@/lib/masters/csv";
import { columnHeader, type FieldDef, formatField, MONTH_OPTIONS, type RefOptions, type Values } from "@/lib/masters/fields";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export class SpreadsheetError extends Error {}

/** Valor de una celda de ExcelJS a algo que entiende parseField. */
function cellValue(v: ExcelJS.CellValue): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

/** Lee la primera hoja de un .xlsx o un .csv y devuelve filas (la primera son los encabezados). */
export async function readSpreadsheet(file: File): Promise<unknown[][]> {
  if (file.size === 0) throw new SpreadsheetError("El archivo está vacío");
  if (file.size > MAX_IMPORT_BYTES) throw new SpreadsheetError("El archivo supera los 5 MB");
  const name = file.name.toLowerCase();
  let rows: unknown[][];
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    rows = parseCsv(await file.text());
  } else if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
    } catch {
      throw new SpreadsheetError("No se pudo leer el Excel. Guardalo como .xlsx (Excel 2007 o posterior) o como CSV.");
    }
    const ws = wb.worksheets.find((w) => w.state === "visible") ?? wb.worksheets[0];
    if (!ws) throw new SpreadsheetError("El Excel no tiene hojas");
    rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) values.push(cellValue(row.getCell(c).value));
      rows.push(values);
    });
  } else if (name.endsWith(".xls")) {
    throw new SpreadsheetError("El formato .xls (Excel 97) no es compatible: abrilo y guardalo como .xlsx o CSV.");
  } else {
    throw new SpreadsheetError("Formato no admitido: subí un archivo .xlsx o .csv");
  }
  rows = rows.filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  if (rows.length < 2) throw new SpreadsheetError("El archivo no tiene filas de datos debajo de los encabezados");
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new SpreadsheetError(`Máximo ${MAX_IMPORT_ROWS} filas por importación; dividí el archivo`);
  return rows;
}

function optionsHelp(f: FieldDef): string {
  if (f.type === "select" || f.type === "multiselect") return (f.options ?? []).map((o) => o.label).join(" / ");
  if (f.type === "bool") return "Sí / No";
  if (f.type === "months") return `Ej.: ${MONTH_OPTIONS.slice(1, 3).map((m) => m.label).join(", ")}`;
  if (f.type === "tags") return "Separadas por coma";
  if (f.type === "ref") return "Nombre o CUIT";
  if (f.type === "number" || f.type === "int") return "Número";
  return "";
}

export interface SheetSpec {
  title: string;
  fields: readonly FieldDef[];
  rows: readonly Values[];
  refs?: RefOptions;
  /** Texto para la hoja de instrucciones */
  notes?: string[];
}

/** Excel con encabezados fijos, filtros y una hoja de instrucciones con las opciones válidas. */
export async function buildXlsx(spec: SheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Coverline ERP";
  wb.created = new Date();
  const ws = wb.addWorksheet(spec.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = spec.fields.map((f) => ({
    header: columnHeader(f),
    key: f.key,
    width: Math.min(45, Math.max(12, columnHeader(f).length + 4, f.type === "textarea" ? 40 : 0)),
  }));
  for (const r of spec.rows) ws.addRow(Object.fromEntries(spec.fields.map((f) => [f.key, formatField(f, r[f.key] ?? null, spec.refs)])));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2A37" } };
  header.alignment = { vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.fields.length } };

  const help = wb.addWorksheet("Instrucciones");
  help.columns = [
    { header: "Columna", key: "col", width: 30 },
    { header: "Obligatoria", key: "req", width: 12 },
    { header: "Valores admitidos", key: "opts", width: 60 },
    { header: "Ayuda", key: "help", width: 70 },
  ];
  help.getRow(1).font = { bold: true };
  for (const f of spec.fields) help.addRow({ col: f.label, req: f.required ? "Sí" : "", opts: optionsHelp(f), help: f.help ?? "" });
  if (spec.notes?.length) {
    help.addRow({});
    for (const note of spec.notes) help.addRow({ col: note });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(spec: SheetSpec): string {
  return toCsv([spec.fields.map(columnHeader), ...spec.rows.map((r) => spec.fields.map((f) => formatField(f, r[f.key] ?? null, spec.refs)))]);
}
