import "server-only";

import { monthSummary, type MonthSummary, type SalaryConceptKey } from "@/lib/validations/payroll";
import { PAYMENT_METHOD_LABELS } from "@/lib/validations/purchasing";
import { db } from "@/server/db";

export interface SalaryPaymentRow {
  id: string;
  number: number;
  date: string;
  period: string;
  concept: SalaryConceptKey;
  amount: number;
  method: string;
  notes: string | null;
}

const paymentRow = (o: {
  id: string;
  number: number;
  date: Date;
  salaryPeriod: string | null;
  salaryConcept: SalaryConceptKey | null;
  amount: { toNumber(): number };
  method: keyof typeof PAYMENT_METHOD_LABELS | null;
  notes: string | null;
}): SalaryPaymentRow => ({
  id: o.id,
  number: o.number,
  date: o.date.toISOString(),
  period: o.salaryPeriod ?? "",
  concept: o.salaryConcept ?? "SUELDO",
  amount: o.amount.toNumber(),
  method: o.method ? PAYMENT_METHOD_LABELS[o.method] : "—",
  notes: o.notes,
});

export interface PayrollMonthRow extends MonthSummary {
  id: string;
  name: string;
  position: string;
  branch: string | null;
  baseSalary: number;
  active: boolean;
  payments: SalaryPaymentRow[];
}

/** Sueldos de un mes: cada empleado activo (o con pagos en el mes) con lo pagado y lo pendiente. */
export async function getPayrollMonth(period: string): Promise<PayrollMonthRow[]> {
  const employees = await db.employee.findMany({
    where: { OR: [{ active: true }, { paymentOrders: { some: { salaryPeriod: period } } }] },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      branch: { select: { name: true } },
      paymentOrders: { where: { salaryPeriod: period }, orderBy: { date: "asc" } },
    },
  });
  return employees.map((e) => {
    const payments = e.paymentOrders.map(paymentRow);
    return {
      id: e.id,
      name: e.name,
      position: e.position,
      branch: e.branch?.name ?? null,
      baseSalary: e.baseSalary.toNumber(),
      active: e.active,
      payments,
      ...monthSummary(e.baseSalary.toNumber(), payments),
    };
  });
}

/** Ficha del empleado con sus pagos (los últimos 24 meses, agrupados por mes). */
export async function getEmployeePayroll(id: string) {
  const e = await db.employee.findUnique({
    where: { id },
    include: { branch: { select: { name: true } }, paymentOrders: { orderBy: [{ salaryPeriod: "desc" }, { date: "desc" }], take: 300 } },
  });
  if (!e) return null;
  const byPeriod = new Map<string, SalaryPaymentRow[]>();
  for (const o of e.paymentOrders) {
    const row = paymentRow(o);
    byPeriod.set(row.period, [...(byPeriod.get(row.period) ?? []), row]);
  }
  const months = [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 24)
    .map(([period, payments]) => ({ period, payments, ...monthSummary(e.baseSalary.toNumber(), payments) }));
  return {
    id: e.id,
    name: e.name,
    cuil: e.cuil,
    position: e.position,
    branch: e.branch?.name ?? null,
    startDate: e.startDate?.toISOString() ?? null,
    baseSalary: e.baseSalary.toNumber(),
    bankAccount: e.bankAccount,
    phone: e.phone,
    active: e.active,
    months,
  };
}
