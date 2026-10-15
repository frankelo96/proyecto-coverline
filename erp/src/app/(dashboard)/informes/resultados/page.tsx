import type { Metadata } from "next";

import { PrintButton } from "@/components/production/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isoLocalDate } from "@/lib/dates";
import { shiftMonth } from "@/lib/finance/periods";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { periodLabel } from "@/lib/validations/payroll";
import { requirePageUser } from "@/server/auth/session";
import { incomeStatement, type IncomeStatement } from "@/server/queries/finance.queries";

export const metadata: Metadata = { title: "Estado de resultados" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function IncomeStatementPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.cashRead);
  const { mes } = await searchParams;
  const period = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : isoLocalDate().slice(0, 7);
  const periods = [period, shiftMonth(period, -1), shiftMonth(period, -2), shiftMonth(period, -12)];
  const data = await Promise.all(periods.map(incomeStatement));
  const expenseNames = [...new Set(data.flatMap((d) => d.expenses.map((e) => e.name)))];
  const cols = data.map((d) => ({ d, expenses: new Map(d.expenses.map((e) => [e.name, e.amount])) }));

  const row = (label: string, get: (d: IncomeStatement) => number, opts: { strong?: boolean; negative?: boolean; indent?: boolean } = {}) => (
    <tr className={cn("border-b", opts.strong && "font-semibold")}>
      <td className={cn("py-2", opts.indent && "pl-5 text-muted-foreground")}>{label}</td>
      {cols.map(({ d }, i) => {
        const v = get(d);
        return (
          <td key={i} className={cn("py-2 text-right font-mono tabular-nums", opts.strong && v < 0 && "text-destructive")}>
            {v === 0 ? "—" : `${opts.negative ? "−" : ""}${formatMoney(v, { round: true })}`}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Estado de resultados</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Importes sin IVA. Ventas del POS y entregas de pedidos (las ventas de la tienda web entran si se facturan en el ERP); el costo es el de cada prenda al momento de venderla;
            gastos con categoría y sueldos pagados en el mes.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <form action="/informes/resultados" className="flex gap-2">
            <Input type="month" name="mes" defaultValue={period} aria-label="Mes" className="w-44" />
            <Button type="submit" variant="secondary">
              Ver
            </Button>
          </form>
          <PrintButton />
        </div>
      </div>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2" />
                {periods.map((p, i) => (
                  <th key={p} className={cn("py-2 text-right", i === 0 && "text-primary")}>
                    <span className="capitalize">{periodLabel(p)}</span>
                    {i === 3 && <span className="block text-xs font-normal text-muted-foreground">(año anterior)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row("Ventas", (d) => d.sales)}
              {row("Devoluciones y notas de crédito", (d) => d.returns, { negative: true, indent: true })}
              {row("Ventas netas", (d) => d.netSales, { strong: true })}
              {row("Costo de lo vendido", (d) => d.costOfSales, { negative: true, indent: true })}
              {row("Margen bruto", (d) => d.grossMargin, { strong: true })}
              <tr className="border-b text-xs text-muted-foreground">
                <td className="py-1 pl-5">Margen sobre ventas</td>
                {cols.map(({ d }, i) => (
                  <td key={i} className="py-1 text-right">
                    {d.grossMarginPct === null ? "—" : `${String(d.grossMarginPct).replace(".", ",")}%`}
                  </td>
                ))}
              </tr>
              {expenseNames.map((name) => (
                <tr key={name} className="border-b">
                  <td className="py-2 pl-5 text-muted-foreground">{name}</td>
                  {cols.map(({ expenses }, i) => (
                    <td key={i} className="py-2 text-right font-mono tabular-nums">
                      {expenses.get(name) ? `−${formatMoney(expenses.get(name)!, { round: true })}` : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {row("Sueldos del personal", (d) => d.salaries, { negative: true, indent: true })}
              {row("Total gastos y sueldos", (d) => d.expensesTotal + d.salaries, { negative: true })}
              <tr className="border-t-2 border-foreground text-base font-bold">
                <td className="py-3">Resultado operativo</td>
                {cols.map(({ d }, i) => (
                  <td key={i} className={cn("py-3 text-right font-mono tabular-nums", d.operatingResult < 0 ? "text-destructive" : "text-success")}>
                    {formatMoney(d.operatingResult, { round: true })}
                  </td>
                ))}
              </tr>
              <tr className="text-xs text-muted-foreground">
                <td className="py-1">Cantidad de ventas</td>
                {cols.map(({ d }, i) => (
                  <td key={i} className="py-1 text-right">
                    {d.salesCount}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        No incluye impuestos sobre ganancias ni amortizaciones. Las compras de mercadería no son gasto: entran al stock y se reconocen como costo cuando se venden.
      </p>
    </div>
  );
}
