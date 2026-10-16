"use client";

import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/purchasing/labels";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { COLLECTION_METHODS, type CollectionPayment } from "@/lib/validations/treasury";
import { lookupStoreCreditAction } from "@/server/actions/treasury.actions";

export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export interface PayRow {
  key: number;
  method: CollectionMethod;
  amount: string;
  reference: string;
  cardBrand: string;
  installments: string;
  cheque: { bank: string; number: string; issuerName: string; issuerCuit: string; issueDate: string; paymentDate: string };
  /** PROPIO: lo firma el mismo cliente (librador = cliente). TERCEROS: cheque de otra persona que el cliente endosa. */
  chequeKind: "PROPIO" | "TERCEROS";
}

/** Quién paga, para completar el librador de un cheque propio del cliente. */
export interface PayingClient {
  name: string;
  cuit: string | null;
}

/** Arma el librador de un cheque propio a partir del nombre y documento del cliente ("CUIT 30-…" o solo el número). */
export function payingClientOf(name: string, document: string | null | undefined): PayingClient {
  const digits = (document ?? "").replace(/\D/g, "");
  return { name, cuit: digits.length === 11 ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : null };
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
    chequeKind: "TERCEROS",
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
  client,
}: {
  rows: PayRow[];
  onChange: (rows: PayRow[]) => void;
  methods: readonly CollectionMethod[];
  due: number;
  client?: PayingClient | null;
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
                  // Cheque propio del cliente o de terceros; el formato (físico o eCheq) se elige abajo.
                  value={isCheque ? `CHEQUE:${r.chequeKind}` : r.method}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("CHEQUE:")) {
                      const kind = v.slice(7) as PayRow["chequeKind"];
                      const fill = kind === "PROPIO" && client ? { issuerName: client.name, issuerCuit: client.cuit ?? "" } : kind === "TERCEROS" && r.chequeKind === "PROPIO" ? { issuerName: "", issuerCuit: "" } : {};
                      onChange(rows.map((x) => (x.key === r.key ? { ...x, method: isCheque ? x.method : "CHEQUE", chequeKind: kind, cheque: { ...x.cheque, ...fill } } : x)));
                    } else update(r.key, { method: v as CollectionMethod });
                  }}
                >
                  {methods
                    .filter((m) => m !== "ECHEQ")
                    .flatMap((m) =>
                      m === "CHEQUE"
                        ? [
                            <option key="CHEQUE:PROPIO" value="CHEQUE:PROPIO">
                              Cheque propio del cliente
                            </option>,
                            <option key="CHEQUE:TERCEROS" value="CHEQUE:TERCEROS">
                              Cheque de terceros (endosado)
                            </option>,
                          ]
                        : [
                            <option key={m} value={m}>
                              {METHOD_LABELS[m as PaymentMethod]}
                            </option>,
                          ],
                    )}
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
            {r.method === "VALE" && (
              <StoreCreditLookup
                code={r.reference}
                onCode={(code) => update(r.key, { reference: code })}
                onBalance={(balance) => update(r.key, { amount: String(Math.round(Math.min(balance, Math.max(remaining + num(r.amount), 0)) * 100) / 100) })}
              />
            )}
            {isCheque && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 flex flex-col gap-1">
                  <span className="text-xs font-medium">Formato</span>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato del cheque">
                    {(["CHEQUE", "ECHEQ"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        role="radio"
                        aria-checked={r.method === f}
                        onClick={() => update(r.key, { method: f })}
                        className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors ${r.method === f ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted"}`}
                      >
                        {f === "CHEQUE" ? "Cheque físico" : "eCheq (electrónico)"}
                      </button>
                    ))}
                  </div>
                  {r.chequeKind === "PROPIO" && <span className="text-xs text-muted-foreground">Cheque firmado por el mismo cliente: el librador es el cliente.</span>}
                  {r.chequeKind === "TERCEROS" && <span className="text-xs text-muted-foreground">Cheque de otra persona que el cliente endosa: cargá los datos de quien lo firmó.</span>}
                </div>
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

/** Código del vale con consulta de saldo (el importe se ajusta a lo que tiene el vale). */
function StoreCreditLookup({ code, onCode, onBalance }: { code: string; onCode: (code: string) => void; onBalance: (balance: number) => void }) {
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function lookup() {
    setPending(true);
    try {
      const r = await lookupStoreCreditAction({ code });
      if (r.ok) {
        onCode(r.data.code);
        onBalance(r.data.balance);
        setInfo({ ok: true, text: `Saldo ${formatMoney(r.data.balance)}${r.data.client ? ` · ${r.data.client}` : ""}` });
      } else setInfo({ ok: false, text: r.error });
    } catch {
      setInfo({ ok: false, text: "No se pudo consultar el vale" });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          aria-label="Código del vale"
          placeholder="Código del vale (ej. 7K3M-9QX2)"
          maxLength={20}
          className="font-mono uppercase"
          value={code}
          onChange={(e) => {
            onCode(e.target.value);
            setInfo(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => void lookup()} disabled={pending || code.trim().length < 8}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />} Saldo
        </Button>
      </div>
      {info && <p className={`text-xs ${info.ok ? "text-success" : "text-destructive"}`}>{info.text}</p>}
    </div>
  );
}
