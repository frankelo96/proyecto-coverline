import { NextResponse } from "next/server";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { ENTITIES, ENTITY_KEYS } from "@/lib/masters/definitions";
import { columnHeader, formatField } from "@/lib/masters/fields";
import { getCurrentUser } from "@/server/auth/session";
import { ADAPTERS } from "@/server/masters/adapters";
import { type Report, REPORTS } from "@/server/reports/reports";
import { reportsToXlsx, XLSX_TYPE } from "@/server/reports/writer";

/**
 * Respaldo completo en un solo Excel: todos los maestros (re-importables) y
 * los informes de cuentas corrientes, cheques, stock y movimientos del año.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sesión expirada", { status: 401 });
  if (!hasPermission(user.permissions, PERMISSIONS.usersManage)) return new NextResponse("Sin permiso", { status: 403 });

  const sheets: { report: Report; sheet: string }[] = [];
  for (const key of ENTITY_KEYS) {
    const def = ENTITIES[key];
    const [rows, refs] = await Promise.all([ADAPTERS[key].exportRows(), ADAPTERS[key].refs()]);
    sheets.push({
      sheet: def.title,
      report: {
        title: def.title,
        filename: key,
        columns: def.fields.map((f) => ({ key: f.key, label: columnHeader(f) })),
        rows: rows.map((r) => Object.fromEntries(def.fields.map((f) => [f.key, formatField(f, r[f.key] ?? null, refs)]))),
      },
    });
  }
  const year = new URLSearchParams({ desde: `${new Date().getFullYear()}-01-01` });
  for (const key of ["clientes-saldos", "acreedores-saldos", "cheques", "stock", "ventas", "compras", "presupuestos"]) {
    sheets.push({ sheet: REPORTS[key].label.split(" (")[0], report: await REPORTS[key].build(year) });
  }
  const buffer = await reportsToXlsx(sheets);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="respaldo-coverline-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
