import type { Metadata } from "next";

import { SalaryPaymentForm } from "@/components/payroll/salary-payment-form";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isPeriod, monthSummary, periodOf } from "@/lib/validations/payroll";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPayrollMonth } from "@/server/queries/payroll.queries";
import { getPaymentSources } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Registrar pago de sueldo" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ empleado?: string; mes?: string }> };

const currentPeriod = () => periodOf(new Date());

export default async function SalaryPaymentPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.payrollWrite);
  const { empleado, mes } = await searchParams;
  const period = mes && isPeriod(mes) ? mes : currentPeriod();
  const [employees, month, sources, detail] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, position: true } }),
    getPayrollMonth(period),
    getPaymentSources(),
    empleado ? db.employee.findUnique({ where: { id: empleado }, select: { baseSalary: true, bankAccount: true } }) : null,
  ]);
  const selected = employees.find((e) => e.id === empleado) ?? null;
  const row = month.find((r) => r.id === empleado);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Registrar pago</h1>
        <p className="text-sm text-muted-foreground">Sueldo, adelanto, aguinaldo, vacaciones, premios u horas extra. El pago sale de la caja o cuenta que elijas y queda registrado en tesorería.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Primero cargá al personal en la pestaña Empleados.</p>
          ) : (
            <SalaryPaymentForm
              key={`${empleado ?? ""}-${period}`}
              employees={employees}
              employee={selected}
              period={period}
              summary={row ?? (detail ? monthSummary(detail.baseSalary.toNumber(), []) : null)}
              baseSalary={detail?.baseSalary.toNumber() ?? 0}
              bankAccount={detail?.bankAccount ?? null}
              sources={sources}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
