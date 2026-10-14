import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ExportButtons } from "@/components/documents/export-buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/purchasing/math";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { listCreditors, type CreditorType } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Cuentas a pagar" };
export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; type: CreditorType | null }[] = [
  { key: "todos", label: "Todos", type: null },
  { key: "proveedores", label: "Proveedores", type: "proveedor" },
  { key: "talleres", label: "Talleres", type: "taller" },
];

type Props = { searchParams: Promise<{ tipo?: string; saldo?: string }> };

export default async function PayablesPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.payablesRead);
  const { tipo, saldo } = await searchParams;
  const tab = TABS.find((t) => t.key === tipo) ?? TABS[0];
  const onlyWithBalance = saldo !== "todos";
  const all = await listCreditors();
  const rows = all.filter((r) => (!tab.type || r.type === tab.type) && (!onlyWithBalance || r.balance > 0));
  const sum = (k: (typeof AGING_BUCKETS)[number]) => rows.reduce((a, r) => a + r.aging[k], 0);
  const total = rows.reduce((a, r) => a + r.balance, 0);
  const qs = (t: string, s: boolean) => `/compras/cuentas?${new URLSearchParams({ ...(t !== "todos" && { tipo: t }), ...(!s && { saldo: "todos" }) })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Cuentas a pagar</h1>
          <p className="text-sm text-muted-foreground">
            Saldo total <strong className="text-foreground">{formatMoney(total)}</strong> · vencido{" "}
            <strong className={total - sum("A_VENCER") > 0 ? "text-destructive" : "text-foreground"}>{formatMoney(total - sum("A_VENCER"))}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButtons report="acreedores-saldos" label="Exportar saldos" />
          {hasPermission(user.permissions, PERMISSIONS.payablesPay) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/compras/cuentas/importar">
                <Upload /> Importar saldos iniciales
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Tipo de acreedor" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={qs(t.key, onlyWithBalance)}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "flex h-10 items-center rounded-md border px-3 text-sm",
                t === tab ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Link href={qs(tab.key, !onlyWithBalance)} className="flex h-10 items-center px-2 text-sm underline underline-offset-4">
          {onlyWithBalance ? "Ver también sin saldo" : "Solo con saldo"}
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Acreedor</TableHead>
              {AGING_BUCKETS.map((b) => (
                <TableHead key={b} className="text-right">
                  {AGING_LABELS[b]}
                </TableHead>
              ))}
              <TableHead className="pr-5 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No hay saldos pendientes.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={`${r.type}-${r.id}`}>
                <TableCell className="pl-5">
                  <Link href={`/compras/cuentas/${r.type}/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                  <span className="ml-2">
                    <Badge variant={r.type === "taller" ? "accent" : "outline"}>{r.type === "taller" ? "Taller" : "Proveedor"}</Badge>
                  </span>
                </TableCell>
                {AGING_BUCKETS.map((b) => (
                  <TableCell
                    key={b}
                    className={cn("text-right font-mono tabular-nums", r.aging[b] > 0 && b !== "A_VENCER" && "text-destructive", r.aging[b] === 0 && "text-muted-foreground")}
                  >
                    {r.aging[b] > 0 ? formatMoney(r.aging[b], { round: true }) : "—"}
                  </TableCell>
                ))}
                <TableCell className="pr-5 text-right font-mono font-semibold tabular-nums">{formatMoney(r.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-5">Total</TableCell>
                {AGING_BUCKETS.map((b) => (
                  <TableCell key={b} className="text-right font-mono tabular-nums">
                    {formatMoney(sum(b), { round: true })}
                  </TableCell>
                ))}
                <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(total)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
