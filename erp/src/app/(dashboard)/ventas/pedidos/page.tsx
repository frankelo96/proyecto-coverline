import { ChevronLeft, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { isoLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/validations/orders";
import { requirePageUser } from "@/server/auth/session";
import { listOrders, type OrderFilter } from "@/server/queries/orders.queries";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "abiertos", label: "Pendientes" },
  { key: "listos", label: "Listos para entregar" },
  { key: "entregados", label: "Entregados" },
  { key: "cancelados", label: "Cancelados" },
  { key: "todos", label: "Todos" },
];

const STATUS_VARIANT = { ABIERTO: "outline", EN_PRODUCCION: "accent", LISTO: "success", ENTREGADO: "default", CANCELADO: "destructive" } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

type Props = { searchParams: Promise<{ filtro?: string; q?: string; aviso?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.posSell);
  const { filtro, q, aviso } = await searchParams;
  const filter = FILTERS.find((f) => f.key === filtro)?.key ?? "abiertos";
  const rows = await listOrders(filter, q?.trim() || null);
  const today = isoLocalDate();
  const pendingBalance = rows.filter((r) => r.status !== "ENTREGADO" && r.status !== "CANCELADO").reduce((a, r) => a + Math.max(0, r.balance), 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/ventas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Ventas y comprobantes
      </Link>
      <FlashNotice message={aviso} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Pedidos de clientes</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos con seña: se cobra la seña, se produce o se separa la mercadería y al entregar se genera la venta descontando lo señado.
            {pendingBalance > 0 && ` Saldo a cobrar de estos pedidos: ${formatMoney(pendingBalance)}.`}
          </p>
        </div>
        <Button asChild>
          <Link href="/ventas/pedidos/nuevo">
            <Plus /> Nuevo pedido
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtro" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button key={f.key} asChild size="sm" variant={f.key === filter ? "default" : "outline"}>
              <Link href={`/ventas/pedidos?filtro=${f.key}`}>{f.label}</Link>
            </Button>
          ))}
        </nav>
        <form action="/ventas/pedidos" className="flex gap-2">
          <input type="hidden" name="filtro" value={filter} />
          <Input name="q" defaultValue={q ?? ""} placeholder="N° o cliente" className="w-56" aria-label="Buscar pedido" />
          <Button type="submit" variant="secondary" size="icon" aria-label="Buscar">
            <Search />
          </Button>
        </form>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Señado</TableHead>
                <TableHead className="pr-5 text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const late = r.promisedDate && r.promisedDate.slice(0, 10) < today && r.status !== "ENTREGADO" && r.status !== "CANCELADO";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="pl-5">
                      <Link href={`/ventas/pedidos/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                        #{r.number}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {date(r.createdAt)}
                        {r.branch ? ` · ${r.branch}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>{r.client}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{ORDER_STATUS_LABELS[r.status]}</Badge>
                    </TableCell>
                    <TableCell className={cn(late && "font-semibold text-destructive")}>{r.promisedDate ? `${date(r.promisedDate)}${late ? " (atrasado)" : ""}` : "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.total)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.deposited)}</TableCell>
                    <TableCell className="pr-5 text-right font-mono font-medium tabular-nums">{r.status === "CANCELADO" || r.status === "ENTREGADO" ? "—" : formatMoney(Math.max(0, r.balance))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
