"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState } from "react";

import { type InstrumentRow, instrumentsTotal, PaymentInstruments, toInstrument } from "@/components/purchasing/payment-instruments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { COUNTS_AGAINST_SALARY, type MonthSummary, periodLabel, SALARY_CONCEPT_LABELS, SALARY_CONCEPTS, type SalaryConceptKey } from "@/lib/validations/payroll";
import { createSalaryPaymentAction } from "@/server/actions/payroll.actions";
import type { PaymentSources } from "@/server/queries/purchasing.queries";

interface EmployeeOption {
  id: string;
  name: string;
  position: string;
}

/**
 * Pago de sueldo, adelanto, aguinaldo, etc. El empleado y el mes se eligen
 * arriba (recargan el resumen del mes); el pago sale de la caja o cuenta elegida.
 */
export function SalaryPaymentForm({
  employees,
  employee,
  period,
  summary,
  baseSalary,
  bankAccount,
  sources,
}: {
  employees: EmployeeOption[];
  employee: EmployeeOption | null;
  period: string;
  summary: MonthSummary | null;
  baseSalary: number;
  bankAccount: string | null;
  sources: PaymentSources;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const { pending, status, execute } = useServerAction();
  const [concept, setConcept] = useState<SalaryConceptKey>("SUELDO");
  const [rows, setRows] = useState<InstrumentRow[]>([]);
  const [notes, setNotes] = useState("");
  const [lastPayment, setLastPayment] = useState<string | null>(null);

  const go = (empleado: string, mes: string) => router.replace(`${pathname}?${new URLSearchParams({ ...(empleado ? { empleado } : {}), mes })}`);
  const total = instrumentsTotal(rows, sources);
  const suggested = COUNTS_AGAINST_SALARY.includes(concept) ? (summary?.pending ?? 0) : 0;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!employee) return;
        execute(
          () => createSalaryPaymentAction({ employeeId: employee.id, period, concept, instruments: rows.map(toInstrument), notes: notes.trim() || null }),
          (d) => {
            setLastPayment(d.id);
            setRows([]);
            setNotes("");
            router.refresh();
          },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-emp`}>Empleado</Label>
          <NativeSelect id={`${id}-emp`} value={employee?.id ?? ""} onChange={(e) => go(e.target.value, period)}>
            <option value="" disabled>
              Elegí…
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.position}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-mes`}>Mes que se paga</Label>
          <Input id={`${id}-mes`} type="month" value={period} onChange={(e) => e.target.value && go(employee?.id ?? "", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-concept`}>Concepto</Label>
          <NativeSelect id={`${id}-concept`} value={concept} onChange={(e) => setConcept(e.target.value as SalaryConceptKey)}>
            {SALARY_CONCEPTS.map((c) => (
              <option key={c} value={c}>
                {SALARY_CONCEPT_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {employee && summary && (
        <div className="grid gap-3 rounded-md border bg-muted/40 p-4 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs text-muted-foreground">Sueldo mensual</span>
            <strong className="font-mono">{formatMoney(baseSalary)}</strong>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Pagado de {periodLabel(period)} (sueldo + adelantos)</span>
            <strong className="font-mono">{formatMoney(summary.paidSalary)}</strong>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Falta pagar</span>
            <strong className={summary.pending > 0 ? "font-mono text-destructive" : "font-mono text-success"}>{formatMoney(summary.pending)}</strong>
            {summary.overpaid > 0 && <span className="block text-xs text-destructive">Se pagó {formatMoney(summary.overpaid)} de más</span>}
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Extras del mes</span>
            <strong className="font-mono">{formatMoney(summary.paidExtras)}</strong>
          </div>
          {bankAccount && <p className="text-muted-foreground sm:col-span-4">CBU / alias: {bankAccount}</p>}
        </div>
      )}

      {employee && (
        <>
          <PaymentInstruments sources={sources} rows={rows} onChange={setRows} suggested={suggested} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-notes`}>Observaciones</Label>
            <Input id={`${id}-notes`} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. incluye 4 horas extra" />
          </div>
          <StatusMessage status={status} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || rows.length === 0 || total <= 0}>
              {pending && <Loader2 className="animate-spin" />} Registrar pago de {formatMoney(total)}
            </Button>
            {lastPayment && status?.kind === "success" && (
              <Button asChild variant="outline">
                <Link href={`/compras/pagos/${lastPayment}`} target="_blank">
                  <Printer /> Imprimir comprobante
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
