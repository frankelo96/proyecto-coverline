import { ChevronLeft, ChevronRight, Download, UserPlus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { isPeriod, periodLabel, periodOf, SALARY_CONCEPT_LABELS, shiftPeriod } from "@/lib/validations/payroll";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getPayrollMonth } from "@/server/queries/payroll.queries";

export const metadata: Metadata = { title: "Sueldos" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };

const currentPeriod = () => periodOf(new Date());

export default async function PayrollMonthPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.payrollRead);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.payrollWrite);
  const { mes } = await searchParams;
  const period = mes && isPeriod(mes) ? mes : currentPeriod();
  const rows = await getPayrollMonth(period);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight first-letter:uppercase">Sueldos de {periodLabel(period)}</h1>
          <p className="text-sm text-muted-foreground">
            Personal propio (no talleres). Los adelantos se descuentan del sueldo del mes; aguinaldo, vacaciones, premios y horas extra se pagan aparte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Mes anterior">
            <Link href={`/personal?mes=${shiftPeriod(period, -1)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Mes siguiente">
            <Link href={`/personal?mes=${shiftPeriod(period, 1)}`}>
              <ChevronRight />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/reportes/sueldos?desde=${period}-01&hasta=${period}-01`}>
              <Download /> Excel
            </a>
          </Button>
          {canWrite && (
            <Button asChild variant="outline">
              <Link href="/personal/empleados/nuevo">
                <UserPlus /> Nuevo empleado
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Sueldos del mes", value: sum((r) => (r.active ? r.baseSalary : 0)) },
          { label: "Pagado (sueldo + adelantos)", value: sum((r) => r.paidSalary) },
          { label: "Falta pagar", value: sum((r) => r.pending), warn: true },
          { label: "Extras pagados", value: sum((r) => r.paidExtras) },
        ].map((k) => (
          <div key={k.label} className={cn("flex flex-col gap-1 rounded-lg border bg-card px-4 py-3", k.warn && k.value > 0 && "border-destructive/40")}>
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{k.label}</span>
            <span className={cn("font-mono text-xl font-semibold tabular-nums", k.warn && k.value > 0 && "text-destructive")}>{formatMoney(k.value)}</span>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
          <CardDescription>
            {rows.length === 0 ? (
              <>
                Todavía no hay empleados cargados.{" "}
                {canWrite && (
                  <Link href="/personal/empleados/nuevo" className="text-primary underline">
                    Cargá el primero
                  </Link>
                )}
              </>
            ) : (
              "Tocá «Pagar» para registrar el sueldo, un adelanto o un extra. Sale de la caja o cuenta que elijas y queda en tesorería."
            )}
          </CardDescription>
        </CardHeader>
        {rows.length > 0 && (
          <CardContent className="overflow-x-auto px-0 py-0">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Empleado</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead className="text-right">Sueldo</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Falta</TableHead>
                  <TableHead className="text-right">Extras</TableHead>
                  <TableHead>Pagos del mes</TableHead>
                  {canWrite && <TableHead className="pr-5" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={cn(!r.active && "opacity-60")}>
                    <TableCell className="pl-5">
                      <Link href={`/personal/empleados/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {!r.active && <span className="block text-xs text-muted-foreground">Dado de baja</span>}
                    </TableCell>
                    <TableCell>
                      {r.position}
                      {r.branch && <span className="block text-xs text-muted-foreground">{r.branch}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.baseSalary)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.paidSalary)}</TableCell>
                    <TableCell className={cn("text-right font-mono tabular-nums", r.pending > 0 ? "font-semibold text-destructive" : "text-success")}>
                      {r.pending > 0 ? formatMoney(r.pending) : "Pagado"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.paidExtras ? formatMoney(r.paidExtras) : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.payments.length === 0
                        ? "—"
                        : r.payments.map((p) => (
                            <Link key={p.id} href={`/compras/pagos/${p.id}`} target="_blank" className="block hover:underline">
                              {new Date(p.date).toLocaleDateString("es-AR")} · {SALARY_CONCEPT_LABELS[p.concept]} {formatMoney(p.amount)}
                            </Link>
                          ))}
                    </TableCell>
                    {canWrite && (
                      <TableCell className="pr-5 text-right">
                        {r.active && (
                          <Button asChild size="sm" variant={r.pending > 0 ? "default" : "outline"}>
                            <Link href={`/personal/pagar?empleado=${r.id}&mes=${period}`}>
                              <Wallet /> Pagar
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-5 font-semibold" colSpan={2}>
                    Total
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(sum((r) => (r.active ? r.baseSalary : 0)))}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(sum((r) => r.paidSalary))}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(sum((r) => r.pending))}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(sum((r) => r.paidExtras))}</TableCell>
                  <TableCell colSpan={canWrite ? 2 : 1} />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
