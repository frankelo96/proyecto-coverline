import { NextResponse, type NextRequest } from "next/server";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { buildTicketText, parseWidth } from "@/server/queries/ticket-text";

/** Ticket en texto plano (ASCII) para enviar directo a impresoras térmicas ESC/POS. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ saleId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.permissions, PERMISSIONS.posSell)) return new NextResponse("No autorizado", { status: 401 });
  const { saleId } = await params;
  const width = parseWidth(request.nextUrl.searchParams.get("ancho"));
  const ticket = await buildTicketText(saleId, width);
  if (!ticket) return new NextResponse("Venta inexistente", { status: 404 });
  return new NextResponse(`${ticket.text}\n\n\n`, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="ticket-${ticket.number}-${width}mm.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
