"use client";

import { Banknote, FileText, Trash2, Wallet } from "lucide-react";
import { useId, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/purchasing/labels";
import { METHOD_REGISTER_KINDS } from "@/lib/treasury/cash";
import { type PaymentInstrument, UI_PAYMENT_OPTION_LABELS, UI_PAYMENT_OPTIONS } from "@/lib/validations/purchasing";
import type { PaymentSources } from "@/server/queries/purchasing.queries";

type RegisterMethod = "EFECTIVO" | "TRANSFERENCIA" | "MERCADO_PAGO";
type UiPaymentOption = (typeof UI_PAYMENT_OPTIONS)[number];

export type InstrumentRow =
  | { key: number; type: "REGISTER"; cashRegisterId: string; method: RegisterMethod; amount: string; reference: string }
  | { key: number; type: "THIRD_CHEQUE"; chequeId: string }
  | { key: number; type: "OWN_CHEQUE"; format: "FISICO" | "ECHEQ"; bankRegisterId: string; number: string; paymentDate: string; amount: string };

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

export function toInstrument(r: InstrumentRow): PaymentInstrument {
  if (r.type === "REGISTER") return { type: "REGISTER", method: r.method, cashRegisterId: r.cashRegisterId, amount: num(r.amount), reference: r.reference.trim() || null };
  if (r.type === "THIRD_CHEQUE") return { type: "THIRD_CHEQUE", chequeId: r.chequeId };
  return { type: "OWN_CHEQUE", format: r.format, bankRegisterId: r.bankRegisterId, number: r.number.trim(), paymentDate: r.paymentDate, amount: num(r.amount) };
}

/** Importe total de los medios cargados (los cheques de terceros van por su importe completo). */
export function instrumentsTotal(rows: InstrumentRow[], sources: PaymentSources) {
  const cheques = new Map(sources.cheques.map((c) => [c.id, c.amount]));
  return Math.round(rows.reduce((a, r) => a + (r.type === "THIRD_CHEQUE" ? (cheques.get(r.chequeId) ?? 0) : num(r.amount)), 0) * 100) / 100;
}

/**
 * Medios con los que se paga: efectivo (caja negra o cajas diarias con turno
 * abierto), Banco Macro, Mercado Pago, cheque propio o cheque de terceros.
 */
export function PaymentInstruments({
  sources,
  rows,
  onChange,
  suggested,
}: {
  sources: PaymentSources;
  rows: InstrumentRow[];
  onChange: (rows: InstrumentRow[]) => void;
  /** Importe que se propone al agregar un medio (lo que falta pagar) */
  suggested: number;
}) {
  const id = useId();
  const usable = sources.registers.filter((r) => !r.requiresSession || r.hasOpenSession);
  const banks = sources.registers.filter((r) => r.kind === "BANCO");
  const chequeById = useMemo(() => new Map(sources.cheques.map((c) => [c.id, c])), [sources.cheques]);
  const nextKey = rows.reduce((a, r) => Math.max(a, r.key), 0) + 1;

  /** Cajas o cuentas de donde puede salir cada medio (efectivo: caja negra primero). */
  const registersFor = (method: RegisterMethod) =>
    usable
      .filter((r) => METHOD_REGISTER_KINDS[method]?.includes(r.kind))
      .sort((a, b) => Number(b.kind === "CAJA_RESGUARDO") - Number(a.kind === "CAJA_RESGUARDO"));

  function add(option: UiPaymentOption) {
    const key = nextKey;
    const rest = String(Math.max(0, Math.round((suggested - instrumentsTotal(rows, sources)) * 100) / 100) || "");
    if (option === "EFECTIVO" || option === "TRANSFERENCIA" || option === "MERCADO_PAGO") {
      const reg = registersFor(option)[0];
      onChange([...rows, { key, type: "REGISTER", cashRegisterId: reg?.id ?? "", method: option, amount: rest, reference: "" }]);
    } else if (option === "THIRD_CHEQUE") {
      const used = new Set(rows.flatMap((r) => (r.type === "THIRD_CHEQUE" ? [r.chequeId] : [])));
      const first = sources.cheques.find((c) => !used.has(c.id));
      onChange([...rows, { key, type: "THIRD_CHEQUE", chequeId: first?.id ?? "" }]);
    } else {
      onChange([...rows, { key, type: "OWN_CHEQUE", format: "ECHEQ", bankRegisterId: banks[0]?.id ?? "", number: "", paymentDate: todayIso(), amount: rest }]);
    }
  }

  const update = (key: number, patch: Partial<InstrumentRow>) => onChange(rows.map((r) => (r.key === key ? ({ ...r, ...patch } as InstrumentRow) : r)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Con qué se paga</h3>
        <div className="flex flex-wrap gap-2">
          {UI_PAYMENT_OPTIONS.map((o) => {
            const disabled = o === "THIRD_CHEQUE" ? sources.cheques.length === 0 : o === "OWN_CHEQUE" ? banks.length === 0 : registersFor(o).length === 0;
            const Icon = o === "EFECTIVO" ? Banknote : o === "THIRD_CHEQUE" || o === "OWN_CHEQUE" ? FileText : Wallet;
            return (
              <Button key={o} type="button" size="sm" variant="outline" onClick={() => add(o)} disabled={disabled}>
                <Icon /> {UI_PAYMENT_OPTION_LABELS[o]}
              </Button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Agregá uno o más medios: Efectivo (sale de caja negra; las cajas diarias solo si tienen el turno abierto), Banco Macro, Mercado Pago, Cheque propio o Cheque de terceros.
        </p>
      )}

      {rows.map((r) => (
        <div key={r.key} className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          {r.type === "REGISTER" && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Medio</span>
                <span className="flex h-10 items-center font-medium">{UI_PAYMENT_OPTION_LABELS[r.method]}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-reg`}>Sale de</Label>
                <NativeSelect id={`${id}-${r.key}-reg`} value={r.cashRegisterId} onChange={(e) => update(r.key, { cashRegisterId: e.target.value })}>
                  {registersFor(r.method).map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.name} — saldo {formatMoney(reg.balance, { round: true })}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-a`}>Importe</Label>
                <Input id={`${id}-${r.key}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-ref`}>Referencia</Label>
                <Input id={`${id}-${r.key}-ref`} maxLength={100} placeholder="N° de operación" value={r.reference} onChange={(e) => update(r.key, { reference: e.target.value })} />
              </div>
            </>
          )}
          {r.type === "THIRD_CHEQUE" && (
            <>
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                <Label htmlFor={`${id}-${r.key}-ch`}>Cheque de terceros en cartera (se endosa)</Label>
                <NativeSelect id={`${id}-${r.key}-ch`} value={r.chequeId} onChange={(e) => update(r.key, { chequeId: e.target.value })}>
                  {sources.cheques
                    .filter((c) => c.id === r.chequeId || !rows.some((x) => x.type === "THIRD_CHEQUE" && x.chequeId === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {c.issuerName} · vto. {new Date(c.paymentDate).toLocaleDateString("es-AR")} · {formatMoney(c.amount)}
                      </option>
                    ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Importe</span>
                <span className="flex h-10 items-center justify-end font-mono tabular-nums">{formatMoney(chequeById.get(r.chequeId)?.amount ?? 0)}</span>
              </div>
            </>
          )}
          {r.type === "OWN_CHEQUE" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-b`}>Cheque propio de</Label>
                <div className="flex gap-2">
                  <NativeSelect id={`${id}-${r.key}-f`} aria-label="Formato" value={r.format} onChange={(e) => update(r.key, { format: e.target.value as "FISICO" | "ECHEQ" })}>
                    <option value="ECHEQ">eCheq</option>
                    <option value="FISICO">Cheque</option>
                  </NativeSelect>
                  <NativeSelect id={`${id}-${r.key}-b`} value={r.bankRegisterId} onChange={(e) => update(r.key, { bankRegisterId: e.target.value })}>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-n`}>N° de cheque</Label>
                <Input id={`${id}-${r.key}-n`} inputMode="numeric" maxLength={30} value={r.number} onChange={(e) => update(r.key, { number: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-d`}>Fecha de pago</Label>
                <Input id={`${id}-${r.key}-d`} type="date" value={r.paymentDate} onChange={(e) => update(r.key, { paymentDate: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-a`}>Importe</Label>
                <Input id={`${id}-${r.key}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} />
              </div>
            </>
          )}
          <Button type="button" variant="ghost" size="icon" aria-label="Quitar medio" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  );
}
