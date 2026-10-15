import type { Metadata } from "next";

import { ExportButtons } from "@/components/documents/export-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isoLocalDate } from "@/lib/dates";
import { monthBounds } from "@/lib/finance/periods";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { periodLabel } from "@/lib/validations/payroll";
import { requirePageUser } from "@/server/auth/session";
import { ivaPurchasesBook, ivaSalesBook } from "@/server/queries/finance.queries";

export const metadata: Metadata = { title: "Libro IVA" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function IvaBookPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.cashRead);
  const { mes } = await searchParams;
  const period = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : isoLocalDate().slice(0, 7);
  const { from, to } = monthBounds(period);
  const [sales, purchases] = await Promise.all([ivaSalesBook(from, to), ivaPurchasesBook(from, to)]);
  const lastDay = isoLocalDate(new Date(to.getTime() - 86_400_000));
  const params = { desde: `${period}-01`, hasta: lastDay };
  const balance = Math.round((sales.totals.vat - purchases.totals.vat - purchases.totals.perceptionIva) * 100) / 100;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Libro IVA — <span className="capitalize">{periodLabel(period)}</span></h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Resumen para el contador. Ventas: solo comprobantes con CAE. Compras: por fecha del comprobante. Exportá el detalle en Excel para la declaración jurada.
          </p>
        </div>
        <form action="/informes/iva" className="flex gap-2">
          <Input type="month" name="mes" defaultValue={period} aria-label="Mes" className="w-44" />
          <Button type="submit" variant="secondary">
            Ver
          </Button>
        </form>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Débito fiscal (IVA ventas)</dt>
          <dd className="font-mono text-xl font-semibold tabular-nums">{formatMoney(sales.totals.vat)}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Crédito fiscal (IVA compras)</dt>
          <dd className="font-mono text-xl font-semibold tabular-nums">{formatMoney(purchases.totals.vat)}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Percepciones de IVA sufridas</dt>
          <dd className="font-mono text-xl font-semibold tabular-nums">{formatMoney(purchases.totals.perceptionIva)}</dd>
        </div>
        <div className="rounded-lg bg-ink p-4 text-ink-foreground">
          <dt className="text-xs text-ink-muted">Saldo técnico estimado</dt>
          <dd className={cn("font-mono text-xl font-semibold tabular-nums", balance < 0 && "text-success")}>{formatMoney(balance)}</dd>
          <dd className="text-xs text-ink-muted">{balance >= 0 ? "a pagar (sin saldos anteriores ni retenciones)" : "a favor"}</dd>
        </div>
      </dl>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>IVA Ventas ({sales.rows.length} comprobantes)</CardTitle>
            <CardDescription>
              Neto {formatMoney(sales.totals.net)} · IVA 21% {formatMoney(sales.totals.vat21)} · IVA 10,5% {formatMoney(sales.totals.vat105)} · Total {formatMoney(sales.totals.total)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExportButtons report="iva-ventas" params={params} label="Libro IVA Ventas (Excel)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>IVA Compras ({purchases.rows.length} comprobantes)</CardTitle>
            <CardDescription>
              Neto {formatMoney(purchases.totals.net)} · IVA {formatMoney(purchases.totals.vat)} · Percep. IIBB {formatMoney(purchases.totals.perceptionIibb)} · Total{" "}
              {formatMoney(purchases.totals.total)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExportButtons report="iva-compras" params={params} label="Libro IVA Compras (Excel)" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
