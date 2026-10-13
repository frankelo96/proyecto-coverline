import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/permissions";
import { ENTITIES, isEntityKey } from "@/lib/masters/definitions";
import { getCurrentUser } from "@/server/auth/session";
import { ADAPTERS } from "@/server/masters/adapters";
import { buildCsv, buildXlsx } from "@/server/masters/spreadsheet";

/**
 * Exporta un maestro a Excel o CSV.  ?formato=csv  ?plantilla=1 (solo encabezados + instrucciones)
 * El archivo exportado se puede editar y volver a importar.
 */
export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!isEntityKey(entity)) return new NextResponse("No encontrado", { status: 404 });
  const def = ENTITIES[entity];
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sesión expirada", { status: 401 });
  if (!hasPermission(user.permissions, def.readPermission)) return new NextResponse("Sin permiso", { status: 403 });

  const url = new URL(req.url);
  const template = url.searchParams.get("plantilla") === "1";
  const csv = url.searchParams.get("formato") === "csv";
  const adapter = ADAPTERS[entity];
  const [rows, refs] = await Promise.all([template ? Promise.resolve([]) : adapter.exportRows(), adapter.refs()]);
  const spec = { title: def.title, fields: def.fields, rows, refs, notes: [def.matchHelp, "Los encabezados terminados en * son obligatorios."] };
  const stamp = new Date().toISOString().slice(0, 10);
  const base = template ? `plantilla-${entity}` : `${entity}-${stamp}`;

  if (csv) {
    return new NextResponse(buildCsv(spec), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" },
    });
  }
  const buffer = await buildXlsx(spec);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
