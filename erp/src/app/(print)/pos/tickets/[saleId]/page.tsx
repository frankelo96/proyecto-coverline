import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/production/print-button";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { TICKET_COLUMNS } from "@/lib/pos/ticket";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { buildTicketText, parseWidth } from "@/server/queries/ticket-text";

export const metadata: Metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ saleId: string }>; searchParams: Promise<{ ancho?: string }> };

/** Área imprimible: 80 mm → 72 mm, 58 mm → 48 mm. */
const PRINTABLE_MM = { 58: 48, 80: 72 } as const;

export default async function TicketPage({ params, searchParams }: Props) {
  await requirePageUser(PERMISSIONS.posSell);
  const { saleId } = await params;
  const width = parseWidth((await searchParams).ancho);
  const ticket = await buildTicketText(saleId, width);
  if (!ticket) notFound();
  const mm = PRINTABLE_MM[width];
  // Fuente monoespaciada (~0,6 em por carácter) ajustada para que entren las columnas exactas.
  const fontSize = `calc(${mm}mm / ${(TICKET_COLUMNS[width] * 0.6).toFixed(2)})`;

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{`@page { size: ${width}mm auto; margin: 2mm 4mm; }`}</style>
      <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
        {([58, 80] as const).map((w) => (
          <Button key={w} asChild variant={w === width ? "default" : "outline"} size="sm">
            <Link href={`?ancho=${w}`}>{w} mm</Link>
          </Button>
        ))}
        <Button asChild variant="outline" size="sm">
          <a href={`/api/tickets/${saleId}?ancho=${width}`}>
            <Download /> Texto ESC/POS
          </a>
        </Button>
        <PrintButton />
      </div>
      <pre
        className={cn("m-0 border border-dashed border-black/30 bg-white p-2 leading-tight text-black print:border-0 print:p-0")}
        style={{ width: `${mm}mm`, fontSize, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
      >
        {ticket.text}
      </pre>
    </div>
  );
}
