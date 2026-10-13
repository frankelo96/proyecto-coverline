import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { voucherLabel } from "@/server/queries/sales.queries";

const parseDate = (v: string | null, fallback: Date) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : fallback);

/** Ventas y devoluciones del período en Excel (?desde=AAAA-MM-DD&hasta=AAAA-MM-DD). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sesión expirada", { status: 401 });
  if (!hasPermission(user.permissions, PERMISSIONS.posSell)) return new NextResponse("Sin permiso", { status: 403 });
  const url = new URL(req.url);
  const now = new Date();
  const from = parseDate(url.searchParams.get("desde"), new Date(now.getFullYear(), now.getMonth(), 1));
  const to = parseDate(url.searchParams.get("hasta"), now);
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);

  const sales = await db.sale.findMany({
    where: { createdAt: { gte: from, lt: toEnd } },
    orderBy: { createdAt: "asc" },
    include: { client: true, branch: { select: { name: true } }, user: { select: { name: true } }, payments: { select: { method: true, amount: true } } },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ventas", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Fecha", key: "date", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { header: "N° interno", key: "number", width: 10 },
    { header: "Tipo", key: "kind", width: 12 },
    { header: "Comprobante", key: "voucher", width: 26 },
    { header: "CAE", key: "cae", width: 16 },
    { header: "Local", key: "branch", width: 18 },
    { header: "Vendedor", key: "user", width: 18 },
    { header: "Cliente", key: "client", width: 30 },
    { header: "CUIT/DNI", key: "doc", width: 16 },
    { header: "Condición IVA", key: "tax", width: 18 },
    { header: "Neto", key: "net", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "IVA", key: "vat", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Total", key: "total", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Medios de pago", key: "methods", width: 36 },
    { header: "Estado", key: "status", width: 12 },
  ];
  for (const s of sales) {
    // Las devoluciones restan.
    const sign = s.kind === "DEVOLUCION" ? -1 : 1;
    ws.addRow({
      date: s.createdAt,
      number: s.number,
      kind: s.kind === "DEVOLUCION" ? "Devolución" : "Venta",
      voucher: voucherLabel(s),
      cae: s.cae,
      branch: s.branch?.name ?? "",
      user: s.user.name,
      client: s.client?.businessName ?? "Consumidor final",
      doc: s.client?.documentNumber ?? "",
      tax: s.client ? TAX_CONDITION_LABELS[s.client.taxCondition] : "Consumidor final",
      net: sign * s.subtotal.toNumber(),
      vat: sign * s.taxTotal.toNumber(),
      total: sign * s.total.toNumber(),
      methods: s.payments.map((p) => `${METHOD_LABELS[p.method]} ${p.amount.toNumber().toLocaleString("es-AR")}`).join(" · "),
      status: s.status === "ANULADA" ? "Anulada" : "",
    });
  }
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2A37" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  if (sales.length) {
    const last = ws.rowCount;
    const totalRow = ws.addRow({ client: "TOTAL" });
    for (const col of ["K", "L", "M"]) totalRow.getCell(col).value = { formula: `SUBTOTAL(9,${col}2:${col}${last})` };
    totalRow.font = { bold: true };
  }

  const name = `ventas-${from.toISOString().slice(0, 10)}-a-${to.toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(await wb.xlsx.writeBuffer()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
