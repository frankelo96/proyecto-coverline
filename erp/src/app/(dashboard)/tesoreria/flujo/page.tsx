import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { cashFlowProjection } from "@/server/queries/finance.queries";

export const metadata: Metadata = { title: "Flujo de fondos" };
export const dynamic = "force-dynamic";

const m = (v: number) => (v === 0 ? "—" : formatMoney(v, { round: true }));

export default async function CashFlowPage() {
  await requirePageUser(PERMISSIONS.cashRead);
  const f = await cashFlowProjection(8);
  const lowest = Math.min(...f.weeks.map((w) => w.balance));

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Proyección de las próximas 8 semanas con lo que ya está en el sistema: cobros de cuenta corriente por vencimiento, cheques en cartera por fecha de cobro y saldos de pedidos
        por fecha de entrega; pagos a proveedores y talleres por vencimiento, cheques propios y un promedio de gastos fijos y sueldos ({formatMoney(f.monthlyFixed, { round: true })}{" "}
        por mes). Lo vencido se cuenta en la primera semana.
      </p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-ink p-4 text-ink-foreground">
          <dt className="text-xs text-ink-muted">Saldo hoy (todas las cajas y cuentas)</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(f.start, { round: true })}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Saldo proyectado en 8 semanas</dt>
          <dd className={cn("font-mono text-2xl font-semibold tabular-nums", f.weeks.at(-1)!.balance < 0 && "text-destructive")}>{formatMoney(f.weeks.at(-1)!.balance, { round: true })}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Punto más bajo</dt>
          <dd className={cn("font-mono text-2xl font-semibold tabular-nums", lowest < 0 && "text-destructive")}>{formatMoney(lowest, { round: true })}</dd>
        </div>
      </dl>
      <Card>
        <CardHeader>
          <CardTitle>Semana a semana</CardTitle>
          {lowest < 0 && <CardDescription className="font-medium text-destructive">Hay semanas con saldo negativo: conviene adelantar cobros o reprogramar pagos.</CardDescription>}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Semana</TableHead>
                <TableHead className="text-right">Cuentas ctes.</TableHead>
                <TableHead className="text-right">Cheques</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Proveedores</TableHead>
                <TableHead className="text-right">Cheques propios</TableHead>
                <TableHead className="text-right">Fijos y sueldos</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.weeks.map((w) => (
                <TableRow key={w.label}>
                  <TableCell className="whitespace-nowrap">{w.label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-success">{m(w.receivables)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-success">{m(w.cheques)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-success">{m(w.orders)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-destructive">{m(w.payables)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-destructive">{m(w.ownCheques)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-destructive">{m(w.fixedCosts)}</TableCell>
                  <TableCell className={cn("text-right font-mono tabular-nums", w.net < 0 && "text-destructive")}>{formatMoney(w.net, { round: true })}</TableCell>
                  <TableCell className={cn("text-right font-mono font-semibold tabular-nums", w.balance < 0 && "text-destructive")}>{formatMoney(w.balance, { round: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Saldo de hoy por caja y cuenta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {f.startBalances.map((r) => (
            <div key={r.name} className="flex justify-between gap-2 rounded-md border px-3 py-2">
              <span>{r.name}</span>
              <span className="font-mono">{formatMoney(r.balance, { round: true })}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
