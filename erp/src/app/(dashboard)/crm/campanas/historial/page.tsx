import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { listCampaigns } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Historial de campañas" };
export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export default async function CampaignHistoryPage() {
  await requirePageUser(PERMISSIONS.crmRead);
  const rows = await listCampaigns();
  return (
    <div className="flex flex-col gap-6">
      <Link href="/crm/campanas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Campañas
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Historial de campañas</h1>
        <p className="text-sm text-muted-foreground">«Compraron» cuenta a los contactados que hicieron una compra o un pedido dentro de los 30 días siguientes al mensaje.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay campañas guardadas.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Campaña</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Destinatarios</TableHead>
                <TableHead className="text-right">Contactados</TableHead>
                <TableHead className="pr-5 text-right">Compraron</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-5">
                    <Link href={`/crm/campanas/historial/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{c.user}</span>
                  </TableCell>
                  <TableCell>{new Date(c.createdAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.recipients}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.sent} <span className="text-xs text-muted-foreground">({pct(c.sent, c.recipients)})</span>
                  </TableCell>
                  <TableCell className="pr-5 text-right font-medium tabular-nums">
                    {c.bought} <span className="text-xs text-muted-foreground">({pct(c.bought, c.sent)})</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
