import type { Metadata } from "next";
import Link from "next/link";

import { ExpenseCategories } from "@/components/treasury/expense-categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isoLocalDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { expensesOfPeriod } from "@/server/queries/finance.queries";

export const metadata: Metadata = { title: "Gastos" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };
const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export default async function ExpensesPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.cashRead);
  const { mes } = await searchParams;
  const period = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : isoLocalDate().slice(0, 7);
  const data = await expensesOfPeriod(period);
  const canManage = hasPermission(user.permissions, PERMISSIONS.cashManage);
  const withAmount = data.categories.filter((c) => c.total > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Los gastos se cargan como egreso en <Link href="/tesoreria" className="underline underline-offset-4">Cajas y cuentas</Link> eligiendo la categoría. Van al estado de resultados; las
          categorías fijas se proyectan en el flujo de fondos.
        </p>
        <form action="/tesoreria/gastos" className="flex gap-2">
          <Input type="month" name="mes" defaultValue={period} aria-label="Mes" className="w-44" />
          <Button type="submit" variant="secondary">
            Ver
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_320px]">
          <CardHeader>
            <CardTitle>Gastos del mes: {formatMoney(data.total)}</CardTitle>
            <CardDescription>Por categoría</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {withAmount.length === 0 && <p className="text-muted-foreground">No hay gastos con categoría en este mes.</p>}
            {withAmount.map((c) => (
              <div key={c.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span className="font-mono">{formatMoney(c.total)}</span>
                </div>
                <div className="h-1.5 rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.max(2, (c.total / data.total) * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0 flex-[999_1_560px]">
          <CardHeader>
            <CardTitle>Detalle</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {data.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Salió de</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{dt(m.date)}</TableCell>
                      <TableCell>{m.category}</TableCell>
                      <TableCell>
                        {m.concept}
                        <span className="block text-xs text-muted-foreground">{m.user}</span>
                      </TableCell>
                      <TableCell>{m.register}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(m.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Categorías de gasto</CardTitle>
            <CardDescription>«Fijo mensual»: se repite todos los meses (alquiler, servicios, honorarios); se usa para proyectar el flujo de fondos.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseCategories categories={data.categories.map(({ id, name, fixed, active }) => ({ id, name, fixed, active }))} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
