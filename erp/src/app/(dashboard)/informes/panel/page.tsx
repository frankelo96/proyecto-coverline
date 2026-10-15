import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { dashboardKpis } from "@/server/queries/finance.queries";

export const metadata: Metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "ink" }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg p-4", tone === "ink" ? "bg-ink text-ink-foreground" : "border bg-card")}>
      <span className={cn("text-xs", tone === "ink" ? "text-ink-muted" : "text-muted-foreground")}>{label}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className={cn("text-xs", tone === "ink" ? "text-ink-muted" : "text-muted-foreground")}>{sub}</span>}
    </div>
  );
}

function Alert({ show, href, children }: { show: boolean; href: string; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <li>
      <Link href={href} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-strong" />
        <span>{children}</span>
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  await requirePageUser(PERMISSIONS.cashRead);
  const k = await dashboardKpis();
  const a = k.alerts;
  const m = (v: number) => formatMoney(v, { round: true });
  const anyAlert =
    a.restock + a.lateOrders + a.readyOrders + a.lateOps + a.pendingCae + a.overdueReceivables.count + a.payablesSoon.count + a.ownChequesSoon.count + a.chequesToDeposit.count > 0;
  const maxBranch = Math.max(1, ...k.byBranch.map((b) => b.total));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Panel</h1>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi tone="ink" label="Ventas de hoy" value={m(k.today.total)} sub={`${k.today.count} ${k.today.count === 1 ? "venta" : "ventas"}`} />
        <Kpi
          label="Ventas del mes"
          value={m(k.month.total)}
          sub={
            k.month.vsPrevPct === null ? (
              `${k.month.count} ventas`
            ) : (
              <span className={cn("inline-flex items-center gap-1", k.month.vsPrevPct >= 0 ? "text-success" : "text-destructive")}>
                {k.month.vsPrevPct >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {String(Math.abs(k.month.vsPrevPct)).replace(".", ",")}% vs. mismo tramo del mes anterior
              </span>
            )
          }
        />
        <Kpi label="Ticket promedio del mes" value={m(k.month.avgTicket)} sub={`${k.month.count} ventas`} />
        <Kpi
          label="Margen bruto del mes (sin IVA)"
          value={m(k.month.grossMargin)}
          sub={
            <>
              {k.month.grossMarginPct === null ? "—" : `${String(k.month.grossMarginPct).replace(".", ",")}% de las ventas`} ·{" "}
              <Link href="/informes/resultados" className="underline underline-offset-4">
                resultado {m(k.month.operatingResult)}
              </Link>
            </>
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Para atender</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {!anyAlert && <p className="text-muted-foreground">Nada pendiente.</p>}
            <ul className="flex flex-col">
              <Alert show={a.pendingCae > 0} href="/ventas?filtro=pendientes">
                {a.pendingCae} comprobantes sin CAE
              </Alert>
              <Alert show={a.readyOrders > 0} href="/ventas/pedidos?filtro=listos">
                {a.readyOrders} pedidos listos para entregar (avisar al cliente)
              </Alert>
              <Alert show={a.lateOrders > 0} href="/ventas/pedidos">
                {a.lateOrders} pedidos con fecha de entrega vencida
              </Alert>
              <Alert show={a.lateOps > 0} href="/produccion/ordenes">
                {a.lateOps} órdenes de producción atrasadas ({a.openOps} en proceso)
              </Alert>
              <Alert show={a.restock > 0} href="/maestros/stock/reposicion">
                {a.restock} talles por debajo del stock mínimo
              </Alert>
              <Alert show={a.overdueReceivables.count > 0} href="/tesoreria/cobranzas">
                {m(a.overdueReceivables.amount)} vencidos en cuentas corrientes de clientes ({a.overdueReceivables.count})
              </Alert>
              <Alert show={a.payablesSoon.count > 0} href="/compras/cuentas">
                {m(a.payablesSoon.amount)} a pagar a proveedores y talleres en los próximos 7 días o vencido ({a.payablesSoon.count})
              </Alert>
              <Alert show={a.ownChequesSoon.count > 0} href="/tesoreria/cheques">
                {m(a.ownChequesSoon.amount)} en cheques propios que se debitan esta semana ({a.ownChequesSoon.count})
              </Alert>
              <Alert show={a.chequesToDeposit.count > 0} href="/tesoreria/cheques">
                {m(a.chequesToDeposit.amount)} en cheques de terceros para depositar esta semana ({a.chequesToDeposit.count})
              </Alert>
            </ul>
            {a.storeCredits.count > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Vales de clientes con saldo: {m(a.storeCredits.amount)} ({a.storeCredits.count}).
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas del mes por local</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {k.byBranch.length === 0 && <p className="text-muted-foreground">Sin ventas este mes.</p>}
            {k.byBranch.map((b) => (
              <div key={b.name} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <span>{b.name}</span>
                  <span className="font-mono">
                    {m(b.total)} <span className="text-xs text-muted-foreground">({b.count})</span>
                  </span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-primary" style={{ width: `${(b.total / maxBranch) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Más vendidos del mes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {k.topProducts.length === 0 && <p className="text-muted-foreground">Sin ventas este mes.</p>}
            <ol className="flex flex-col gap-1.5">
              {k.topProducts.map((p, i) => (
                <li key={p.name} className="flex justify-between gap-2">
                  <span>
                    <span className="text-muted-foreground">{i + 1}.</span> {p.name}
                  </span>
                  <span className="whitespace-nowrap font-mono">
                    {formatNumber(p.quantity)} u. · {m(p.total)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
