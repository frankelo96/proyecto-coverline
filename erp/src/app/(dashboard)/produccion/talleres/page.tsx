import { Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkshopType } from "@/generated/prisma/enums";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { listWorkshopsSummary } from "@/server/queries/production-orders.queries";

export const metadata: Metadata = { title: "Talleres" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<WorkshopType, string> = {
  CONFECCION: "Confección",
  BORDADO: "Bordado",
  ESTAMPADO: "Estampado",
  SUBLIMACION: "Sublimación",
  PLANCHADO: "Planchado",
};

const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default async function WorkshopsPage() {
  await requirePageUser(PERMISSIONS.workshopsRead);
  const workshops = await listWorkshopsSummary();
  const totalPieces = workshops.reduce((a, w) => a + w.piecesHeld, 0);
  const totalDebt = workshops.reduce((a, w) => a + w.payableBalance, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Talleres</h1>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{totalPieces}</strong> piezas en poder de terceros · deuda de fasón{" "}
          <strong className="text-foreground">{formatMoney(totalDebt)}</strong>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workshops.map((w) => (
          <Card key={w.id} className="flex flex-col">
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="leading-snug">{w.name}</CardTitle>
                {w.isInternal && <Badge variant="outline">Interno</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {w.types.map((t) => (
                  <Badge key={t}>{TYPE_LABELS[t]}</Badge>
                ))}
              </div>
              {w.phone && (
                <a href={`tel:${w.phone}`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <Phone aria-hidden="true" className="size-3.5" /> {w.phone}
                </a>
              )}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Piezas en su poder</dt>
                  <dd className="font-mono text-xl font-semibold tabular-nums">{w.piecesHeld}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fasón a pagar</dt>
                  <dd className="font-mono text-xl font-semibold tabular-nums">{formatMoney(w.payableBalance, { round: true })}</dd>
                  {w.overdueBalance > 0 && <dd className="text-xs font-semibold text-destructive">Vencido {formatMoney(w.overdueBalance, { round: true })}</dd>}
                </div>
              </dl>
              {w.orders.length > 0 && (
                <ul className="flex flex-col divide-y border-t text-sm">
                  {w.orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/produccion/ordenes/${o.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:underline">
                        <span>
                          <span className="font-mono text-xs text-muted-foreground">OP #{o.number}</span> {o.productName}
                        </span>
                        <span className="shrink-0 text-right font-mono text-xs tabular-nums">
                          {o.pieces} u.
                          <span className={days(o.since) > 15 ? "block text-destructive" : "block text-muted-foreground"}>hace {days(o.since)} días</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
