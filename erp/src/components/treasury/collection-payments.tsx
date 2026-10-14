"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/purchasing/labels";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { COLLECTION_METHODS, type CollectionPayment } from "@/lib/validations/treasury";

export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export interface PayRow {
  key: number;
  method: CollectionMethod;
  amount: string;
  reference: string;
  cardBrand: string;
  installments: string;
  cheque: { bank: string; number: string; issuerName: string; issuerCuit: string; issueDate: string; paymentDate: string };
}

let seq = 1;
export function newPayRow(method: CollectionMethod, amount = 0, issuerName = ""): PayRow {
  return {
    key: seq++,
    method,
    amount: amount > 0 ? String(Math.round(amount * 100) / 100) : "",
    reference: "",
    cardBrand: "",
    installments: "1",
    cheque: { bank: "", number: "", issuerName, issuerCuit: "", issueDate: todayIso(), paymentDate: todayIso() },
  };
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

export function toCollectionPayload(rows: PayRow[]): CollectionPayment[] {
  return rows.map((r) => {
    const isCheque = r.method === "CHEQUE" || r.method === "ECHEQ";
    const isCard = r.method === "TARJETA_CREDITO" || r.method === "TARJETA_DEBITO";
    return {
      method: r.method,
      amount: num(r.amount),
      reference: r.reference.trim() || null,
      cardBrand: isCard ? r.cardBrand.trim() || null : null,
      installments: r.method === "TARJETA_CREDITO" ? Math.max(1, Math.trunc(num(r.installments))) : null,
      cheque: isCheque
        ? {
            format: r.method === "ECHEQ" ? "ECHEQ" : "FISICO",
            bank: r.cheque.bank.trim(),
            number: r.cheque.number.trim(),
            issuerName: r.cheque.issuerName.trim(),
            issuerCuit: r.cheque.issuerCuit.trim() || null,
            issueDate: r.cheque.issueDate,
            paymentDate: r.cheque.paymentDate,
          }
        : null,
    };
  });
}

export const rowsTotal = (rows: PayRow[]) => rows.reduce((a, r) => a + num(r.amount), 0);

export function CollectionPayments({
  rows,
  onChange,
  methods,
  due,
}: {
  rows: PayRow[];
  onChange: (rows: PayRow[]) => void;
  methods: readonly CollectionMethod[];
  due: number;
}) {
  const id = useId();
  const paid = rowsTotal(rows);
  const remaining = Math.round((due - paid) * 100) / 100;
  const update = (key: number, patch: Partial<PayRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateCheque = (key: number, patch: Partial<PayRow["cheque"]>) => onChange(rows.map((r) => (r.key === key ? { ...r, cheque: { ...r.cheque, ...patch } } : r)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const isCheque = r.method === "CHEQUE" || r.method === "ECHEQ";
        return (
          <div key={r.key} className="flex flex-col gap-3 rounded-md border bg-card p-3">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-m`}>Medio</Label>
                <NativeSelect
                  id={`${id}-${r.key}-m`}
                  // El eCheq es un "Cheque de terceros" con formato electrónico (se elige abajo).
                  value={r.method === "ECHEQ" ? "CHEQUE" : r.method}
                  onChange={(e) => update(r.key, { method: e.target.value as CollectionMethod })}
                >
                  {methods.filter((m) => m !== "ECHEQ").map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABELS[m as PaymentMethod]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${r.key}-a`}>Importe</Label>
                <Input id={`${id}-${r.key}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar medio de pago" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                <Trash2 />
              </Button>
            </div>
            {(r.method === "TARJETA_CREDITO" || r.method === "TARJETA_DEBITO") && (
              <div className="grid grid-cols-3 gap-2">
                <Input aria-label="Tarjeta" placeholder="Visa, Master…" maxLength={30} value={r.cardBrand} onChange={(e) => update(r.key, { cardBrand: e.target.value })} />
                {r.method === "TARJETA_CREDITO" ? (
                  <Input aria-label="Cuotas" type="number" min={1} max={24} inputMode="numeric" value={r.installments} onChange={(e) => update(r.key, { installments: e.target.value })} />
                ) : (
                  <span />
                )}
                <Input aria-label="Cupón / lote" placeholder="Cupón" maxLength={100} value={r.reference} onChange={(e) => update(r.key, { reference: e.target.value })} />
              </div>
            )}
            {(r.method === "TRANSFERENCIA" || r.method === "MERCADO_PAGO" || r.method === "MODO") && (
              <Input aria-label="Referencia" placeholder="N° de operación" maxLength={100} value={r.reference} onChange={(e) => update(r.key, { reference: e.target.value })} />
            )}
            {isCheque && (
              <div className="grid grid-cols-2 gap-2">
                <NativeSelect
                  aria-label="Formato del cheque"
                  className="col-span-2"
                  value={r.method === "ECHEQ" ? "ECHEQ" : "CHEQUE"}
                  onChange={(e) => update(r.key, { method: e.target.value as CollectionMethod })}
                >
                  <option value="CHEQUE">Cheque físico</option>
                  <option value="ECHEQ">eCheq</option>
                </NativeSelect>
                <Input aria-label="Banco" placeholder="Banco" maxLength={60} value={r.cheque.bank} onChange={(e) => updateCheque(r.key, { bank: e.target.value })} />
                <Input aria-label="Número de cheque" placeholder="N° de cheque" maxLength={30} value={r.cheque.number} onChange={(e) => updateCheque(r.key, { number: e.target.value })} />
                <Input aria-label="Librador" placeholder="Librador" maxLength={120} value={r.cheque.issuerName} onChange={(e) => updateCheque(r.key, { issuerName: e.target.value })} />
                <Input aria-label="CUIT del librador" placeholder="CUIT librador" maxLength={13} value={r.cheque.issuerCuit} onChange={(e) => updateCheque(r.key, { issuerCuit: e.target.value })} />
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${id}-${r.key}-ie`} className="text-xs">
                    Emisión
                  </Label>
                  <Input id={`${id}-${r.key}-ie`} type="date" value={r.cheque.issueDate} onChange={(e) => updateCheque(r.key, { issueDate: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${id}-${r.key}-pd`} className="text-xs">
                    Fecha de cobro
                  </Label>
                  <Input id={`${id}-${r.key}-pd`} type="date" value={r.cheque.paymentDate} onChange={(e) => updateCheque(r.key, { paymentDate: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, newPayRow(rows.length === 0 ? "EFECTIVO" : "TRANSFERENCIA", Math.max(remaining, 0))])}
        >
          <Plus /> Medio de pago
        </Button>
        <p className="text-sm" aria-live="polite">
          {remaining > 0.004 ? (
            <span className="font-medium text-destructive">Falta {formatMoney(remaining)}</span>
          ) : remaining < -0.004 ? (
            <span className="font-medium text-success">Vuelto {formatMoney(-remaining)}</span>
          ) : (
            <span className="text-success">Pago completo</span>
          )}
        </p>
      </div>
    </div>
  );
}
