import { z } from "zod";

import { instrumentSchema } from "./purchasing";

export const SALARY_CONCEPTS = ["SUELDO", "ADELANTO", "AGUINALDO", "VACACIONES", "PREMIO", "HORAS_EXTRA", "OTRO"] as const;
export type SalaryConceptKey = (typeof SALARY_CONCEPTS)[number];

export const SALARY_CONCEPT_LABELS: Record<SalaryConceptKey, string> = {
  SUELDO: "Sueldo",
  ADELANTO: "Adelanto",
  AGUINALDO: "Aguinaldo (SAC)",
  VACACIONES: "Vacaciones",
  PREMIO: "Premio / bono",
  HORAS_EXTRA: "Horas extra",
  OTRO: "Otro",
};

/** Conceptos que se descuentan del sueldo mensual; el resto se paga aparte. */
export const COUNTS_AGAINST_SALARY: readonly SalaryConceptKey[] = ["SUELDO", "ADELANTO"];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** "2026-10" → "octubre 2026" */
export function periodLabel(period: string) {
  if (!isPeriod(period)) return period;
  const [y, m] = period.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** Mes de una fecha en formato AAAA-MM (hora de Argentina). */
export function periodOf(date: Date) {
  const local = new Date(date.getTime() - 3 * 3_600_000);
  return local.toISOString().slice(0, 7);
}

export function shiftPeriod(period: string, months: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

export interface MonthSummary {
  /** Sueldo + adelantos pagados en el mes */
  paidSalary: number;
  /** Aguinaldo, vacaciones, premios, horas extra y otros */
  paidExtras: number;
  /** Lo que falta pagar del sueldo del mes (nunca negativo) */
  pending: number;
  /** Se pagó de más respecto del sueldo (adelantos que superan el sueldo) */
  overpaid: number;
}

/** Cuánto se pagó y cuánto falta del sueldo de un mes. */
export function monthSummary(baseSalary: number, payments: { concept: SalaryConceptKey; amount: number }[]): MonthSummary {
  const round = (n: number) => Math.round(n * 100) / 100;
  const paidSalary = round(payments.filter((p) => COUNTS_AGAINST_SALARY.includes(p.concept)).reduce((a, p) => a + p.amount, 0));
  const paidExtras = round(payments.filter((p) => !COUNTS_AGAINST_SALARY.includes(p.concept)).reduce((a, p) => a + p.amount, 0));
  const diff = round(baseSalary - paidSalary);
  return { paidSalary, paidExtras, pending: Math.max(0, diff), overpaid: Math.max(0, -diff) };
}

export const salaryPaymentSchema = z.object({
  employeeId: z.string().min(1, "Elegí el empleado"),
  period: z.string().refine(isPeriod, "Elegí el mes"),
  concept: z.enum(SALARY_CONCEPTS),
  instruments: z.array(instrumentSchema).min(1, "Agregá al menos un medio de pago").max(10),
  notes: z.string().trim().max(500).nullable(),
});
export type SalaryPaymentInput = z.infer<typeof salaryPaymentSchema>;
