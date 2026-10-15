import { ClipboardList, FileSpreadsheet, Search, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ARCA_BADGE } from "@/components/sales/arca-badge";
import { AuthorizeButton } from "@/components/sales/authorize-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/purchasing/labels";
import { cn } from "@/lib/utils";
import { arcaEnabled } from "@/server/arca/config";
import { requirePageUser } from "@/server/auth/session";
import { countPendingCae, listSales, type SalesFilter } from "@/server/queries/sales.queries";

export const metadata: Metadata = { title: "Ventas y comprobantes" };
export const dynamic = "force-dynamic";

const FILTERS: { key: SalesFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pendientes", label: "Pendientes de CAE" },
  { key: "devoluciones", label: "Devoluciones" },
];


type Props = { searchParams: Promise<{ filtro?: string; q?: string; aviso?: string }> };

export default async function SalesPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.posSell);
  const { filtro, q, aviso } = await searchParams;
  const filter = FILTERS.find((f) => f.key === filtro)?.key ?? "todas";
  const [rows, pending] = await Promise.all([listSales(filter, q?.trim() || null), countPendingCae()]);
  const today = todayIso();
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Ventas y comprobantes</h1>
            <Button asChild variant="outline" size="sm">
              <Link href="/ventas/pedidos">
                <ClipboardList /> Pedidos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/ventas/vales">
                <Ticket /> Vales
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {arcaEnabled() ? "Facturación electrónica ARCA activa." : "Facturación electrónica ARCA no configurada: las facturas quedan pendientes de CAE."}
            {pending > 0 && <span className="font-semibold text-accent-strong"> {pending} comprobantes sin CAE.</span>}
          </p>
        </div>
        <form action="/api/reportes/ventas" className="flex flex-wrap items-end gap-2" aria-label="Exportar ventas a Excel">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Desde
            <Input type="date" name="desde" defaultValue={monthStart} className="h-9 w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Hasta
            <Input type="date" name="hasta" defaultValue={today} className="h-9 w-40" />
          </label>
          <Button type="submit" variant="outline" size="sm">
            <FileSpreadsheet /> Exportar Excel
          </Button>
        </form>
      </div>
      <FlashNotice message={aviso} />
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Filtro" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "todas" ? "/ventas" : `/ventas?filtro=${f.key}`}
              aria-current={f.key === filter ? "page" : undefined}
              className={cn("flex h-10 items-center rounded-md border px-3 text-sm", f.key === filter ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="relative w-full max-w-xs" action="/ventas">
          {filter !== "todas" && <input type="hidden" name="filtro" value={filter} />}
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" name="q" defaultValue={q ?? ""} placeholder="N° de venta, comprobante o cliente" aria-label="Buscar venta" className="pl-9" />
        </form>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Venta</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="pr-5">ARCA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No hay comprobantes.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <Link href={`/ventas/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                    #{r.number}
                  </Link>
                  {r.kind === "DEVOLUCION" && (
                    <span className="ml-2">
                      <Badge variant="destructive">Devolución</Badge>
                    </span>
                  )}
                  {r.voided && (
                    <span className="ml-2">
                      <Badge variant="outline">Anulada</Badge>
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{new Date(r.date).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                <TableCell>{r.branchName ?? "—"}</TableCell>
                <TableCell>{r.clientName ?? <span className="text-muted-foreground">Consumidor final</span>}</TableCell>
                <TableCell className="font-mono text-xs">{r.voucher}</TableCell>
                <TableCell className={cn("text-right font-mono tabular-nums", r.kind === "DEVOLUCION" && "text-destructive", r.voided && "text-muted-foreground line-through")}>
                  {formatMoney(r.kind === "DEVOLUCION" ? -r.total : r.total)}
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex flex-col gap-1">
                    <Badge variant={ARCA_BADGE[r.arcaStatus].variant} className="w-fit">
                      {ARCA_BADGE[r.arcaStatus].label}
                    </Badge>
                    {r.arcaError && <span className="max-w-64 text-xs text-destructive">{r.arcaError}</span>}
                    {(r.arcaStatus === "PENDIENTE" || r.arcaStatus === "RECHAZADO") && <AuthorizeButton saleId={r.id} label="Reintentar" size="sm" />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
