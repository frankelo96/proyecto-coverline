import { FilePlus2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuoteStatusBadge } from "@/components/crm/status-badges";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QuoteStatus } from "@/generated/prisma/enums";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { QUOTE_STATUS_LABELS } from "@/lib/masters/labels";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getQuotePipelineSummary, listQuotes } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Presupuestos" };
export const dynamic = "force-dynamic";

const FILTERS: (QuoteStatus | null)[] = [null, "BORRADOR", "ENVIADO", "ACEPTADO", "RECHAZADO", "VENCIDO"];
type Props = { searchParams: Promise<{ estado?: string; q?: string; aviso?: string }> };

export default async function QuotesPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const sp = await searchParams;
  const status = FILTERS.find((f) => f === sp.estado) ?? null;
  const q = sp.q?.trim() || null;
  const [rows, summary] = await Promise.all([listQuotes(status, q), getQuotePipelineSummary()]);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.quotesWrite);
  const href = (s: QuoteStatus | null) => `/crm/presupuestos?${new URLSearchParams({ ...(s ? { estado: s } : {}), ...(q ? { q } : {}) })}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            {summary.openCount} abiertos por <strong className="text-foreground">{formatMoney(summary.openTotal, { round: true })}</strong> · aceptados este mes:{" "}
            {summary.acceptedMonthCount} por <strong className="text-foreground">{formatMoney(summary.acceptedMonthTotal, { round: true })}</strong>
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/crm/presupuestos/nuevo">
              <FilePlus2 /> Nuevo presupuesto
            </Link>
          </Button>
        )}
      </div>
      <FlashNotice message={sp.aviso} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Estado" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f ?? "todos"}
              href={href(f)}
              aria-current={f === status ? "page" : undefined}
              className={cn(
                "flex h-9 items-center rounded-md border px-3 text-sm",
                f === status ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
              )}
            >
              {f ? QUOTE_STATUS_LABELS[f] : "Todos"}
            </Link>
          ))}
        </nav>
        <form role="search" action="/crm/presupuestos" className="relative w-full max-w-xs">
          {status && <input type="hidden" name="estado" value={status} />}
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={q ?? ""} placeholder="N° o cliente…" aria-label="Buscar presupuesto" className="pl-9" />
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente / oportunidad</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="pr-5 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No hay presupuestos {status ? `en estado ${QUOTE_STATUS_LABELS[status].toLowerCase()}` : "todavía"}.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <Link href={`/crm/presupuestos/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                    {r.number}
                  </Link>
                </TableCell>
                <TableCell>{new Date(r.date).toLocaleDateString("es-AR")}</TableCell>
                <TableCell>
                  {r.clientId ? (
                    <Link href={`/crm/clientes/${r.clientId}`} className="underline-offset-4 hover:underline">
                      {r.partyName}
                    </Link>
                  ) : (
                    r.partyName
                  )}
                </TableCell>
                <TableCell>{new Date(r.validUntil).toLocaleDateString("es-AR")}</TableCell>
                <TableCell>
                  <QuoteStatusBadge status={r.status} />
                </TableCell>
                <TableCell>{r.userName}</TableCell>
                <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
