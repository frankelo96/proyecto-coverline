import { ChevronLeft, Pencil, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { periodLabel, SALARY_CONCEPT_LABELS } from "@/lib/validations/payroll";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getEmployeePayroll } from "@/server/queries/payroll.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await getEmployeePayroll((await params).id);
  return { title: e?.name ?? "Empleado" };
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "—");

export default async function EmployeePage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.payrollRead);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.payrollWrite);
  const { id } = await params;
  const { aviso } = await searchParams;
  const e = await getEmployeePayroll(id);
  if (!e) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/personal/empleados" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> Empleados
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {e.name}
            {!e.active && <Badge variant="outline">Dado de baja</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {e.position}
            {e.branch && <> · {e.branch}</>}
            {e.cuil && <> · CUIL {e.cuil}</>}
            {e.startDate && <> · ingresó el {date(e.startDate)}</>}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/personal/empleados/${e.id}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
            {e.active && (
              <Button asChild>
                <Link href={`/personal/pagar?empleado=${e.id}`}>
                  <Wallet /> Registrar pago
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
      <FlashNotice message={aviso} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sueldo mensual</span>
          <span className="font-mono text-xl font-semibold tabular-nums">{formatMoney(e.baseSalary)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">CBU / alias</span>
          <span className="font-mono text-base">{e.bankAccount ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Teléfono</span>
          <span className="text-base">{e.phone ?? "—"}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagos por mes</CardTitle>
          <CardDescription>{e.months.length === 0 ? "Todavía no se le registraron pagos." : "Sueldo y adelantos se comparan con el sueldo mensual; los extras van aparte."}</CardDescription>
        </CardHeader>
        {e.months.length > 0 && (
          <CardContent className="overflow-x-auto px-0 py-0">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Mes</TableHead>
                  <TableHead>Pagos</TableHead>
                  <TableHead className="text-right">Sueldo + adelantos</TableHead>
                  <TableHead className="text-right">Extras</TableHead>
                  <TableHead className="pr-5 text-right">Falta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.months.map((m) => (
                  <TableRow key={m.period}>
                    <TableCell className="pl-5 font-medium first-letter:uppercase">{periodLabel(m.period)}</TableCell>
                    <TableCell className="text-xs">
                      {m.payments.map((p) => (
                        <Link key={p.id} href={`/compras/pagos/${p.id}`} target="_blank" className="block hover:underline">
                          {date(p.date)} · {SALARY_CONCEPT_LABELS[p.concept]} · {p.method} · {formatMoney(p.amount)}
                        </Link>
                      ))}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(m.paidSalary)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{m.paidExtras ? formatMoney(m.paidExtras) : "—"}</TableCell>
                    <TableCell className={cn("pr-5 text-right font-mono tabular-nums", m.pending > 0 ? "text-destructive" : "text-success")}>
                      {m.pending > 0 ? formatMoney(m.pending) : "Pagado"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
