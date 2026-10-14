import "server-only";

import ExcelJS from "exceljs";

import { toCsv } from "@/lib/masters/csv";

import type { CellValue, Report } from "./reports";

const MONEY_FMT = '"$" #,##0.00;[Red]-"$" #,##0.00';

function addSheet(wb: ExcelJS.Workbook, report: Report, name = report.title) {
  // Excel limita el nombre de hoja a 31 caracteres y no admite algunos símbolos.
  const sheetName = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = report.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.type === "money" ? 16 : c.type === "date" ? 12 : c.type === "number" ? 10 : Math.min(48, Math.max(12, c.label.length + 4)),
    style: c.type === "money" ? { numFmt: MONEY_FMT } : c.type === "date" ? { numFmt: "dd/mm/yyyy" } : {},
  }));
  for (const row of report.rows) ws.addRow(row);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2A37" } };
  if (report.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: report.columns.length } };

  // Totales con SUBTOTAL: respetan los filtros que se apliquen en Excel.
  if (report.rows.length && report.columns.some((c) => c.total)) {
    const last = ws.rowCount;
    const totals = ws.addRow({});
    report.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1).letter;
      if (c.total) totals.getCell(col).value = { formula: `SUBTOTAL(9,${col}2:${col}${last})` };
    });
    totals.getCell(1).value = totals.getCell(1).value ?? "TOTAL";
    totals.font = { bold: true };
  }
  return ws;
}

export async function reportsToXlsx(reports: { report: Report; sheet?: string }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Coverline ERP";
  wb.created = new Date();
  for (const r of reports) addSheet(wb, r.report, r.sheet);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const csvValue = (v: CellValue) => (v instanceof Date ? v.toLocaleDateString("es-AR") : v);

export function reportToCsv(report: Report): string {
  return toCsv([report.columns.map((c) => c.label), ...report.rows.map((r) => report.columns.map((c) => csvValue(r[c.key] ?? null)))]);
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
