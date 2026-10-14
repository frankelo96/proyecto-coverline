import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { canRunReport, REPORTS, ReportError } from "@/server/reports/reports";
import { reportsToXlsx, reportToCsv, XLSX_TYPE } from "@/server/reports/writer";

/** Informes en Excel (por defecto) o CSV (?formato=csv). */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report: key } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sesión expirada", { status: 401 });
  if (!REPORTS[key]) return new NextResponse("Informe inexistente", { status: 404 });
  if (!canRunReport(key, user.permissions)) return new NextResponse("Sin permiso", { status: 403 });

  const url = new URL(req.url);
  try {
    const report = await REPORTS[key].build(url.searchParams);
    if (url.searchParams.get("formato") === "csv") {
      return new NextResponse(reportToCsv(report), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report.filename}.csv"`, "Cache-Control": "no-store" },
      });
    }
    const buffer = await reportsToXlsx([{ report }]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${report.filename}.xlsx"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ReportError) return new NextResponse(e.message, { status: 400 });
    throw e;
  }
}
