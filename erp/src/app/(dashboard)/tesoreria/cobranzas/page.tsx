import type { Metadata } from "next";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/purchasing/math";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { listClientBalances } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Cobranzas" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ saldo?: string }> };

export default async function CollectionsPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.receivablesCollect);
  const { saldo } = await searchParams;
  const all = await listClientBalances();
  const rows = saldo === "todos" ? all : all.filter((r) => r.balance > 0);
  const total = rows.reduce((a, r) => a + r.balance, 0);
  const overdue = rows.reduce((a, r) => a + r.overdue, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A cobrar <strong className="text-foreground">{formatMoney(total)}</strong> · vencido{" "}
          <strong className={overdue > 0 ? "text-destructive" : "text-foreground"}>{formatMoney(overdue)}</strong>
        </p>
        <Link href={saldo === "todos" ? "/tesoreria/cobranzas" : "/tesoreria/cobranzas?saldo=todos"} className="text-sm underline underline-offset-4">
          {saldo === "todos" ? "Solo con saldo" : "Ver todos los clientes"}
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Cliente</TableHead>
              {AGING_BUCKETS.map((b) => (
                <TableHead key={b} className="text-right">
                  {AGING_LABELS[b]}
                </TableHead>
              ))}
              <TableHead className="text-right">Límite</TableHead>
              <TableHead className="pr-5 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No hay saldos a cobrar.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <Link href={`/tesoreria/cobranzas/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                {AGING_BUCKETS.map((b) => (
                  <TableCell key={b} className={cn("text-right font-mono tabular-nums", r.aging[b] > 0 && b !== "A_VENCER" && "text-destructive", r.aging[b] === 0 && "text-muted-foreground")}>
                    {r.aging[b] > 0 ? formatMoney(r.aging[b], { round: true }) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{r.creditLimit > 0 ? formatMoney(r.creditLimit, { round: true }) : "—"}</TableCell>
                <TableCell className="pr-5 text-right font-mono font-semibold tabular-nums">{formatMoney(r.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
