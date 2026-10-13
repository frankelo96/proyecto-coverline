"use client";

import { Banknote, FileText, Loader2, Printer, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CashRegisterKind } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { agingBucket, AGING_LABELS, allocatePayment, PurchasingError } from "@/lib/purchasing/math";
import { todayIso } from "@/lib/purchasing/labels";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentInstrument } from "@/lib/validations/purchasing";
import { createPaymentOrderAction } from "@/server/actions/purchasing.actions";
import type { CreditorStatement } from "@/server/queries/purchasing.queries";

/** Medio sugerido según el tipo de caja/cuenta. */
const DEFAULT_METHOD: Record<CashRegisterKind, (typeof PAYMENT_METHODS)[number]> = {
  CAJA_DIARIA: "EFECTIVO",
  CAJA_ADMINISTRATIVA: "EFECTIVO",
  CAJA_RESGUARDO: "EFECTIVO",
  BILLETERA_VIRTUAL: "MERCADO_PAGO",
  BANCO: "TRANSFERENCIA",
};

type Row =
  | { key: number; type: "REGISTER"; cashRegisterId: string; method: (typeof PAYMENT_METHODS)[number]; amount: string; reference: string }
  | { key: number; type: "THIRD_CHEQUE"; chequeId: string }
  | { key: number; type: "OWN_CHEQUE"; format: "FISICO" | "ECHEQ"; bankRegisterId: string; number: string; paymentDate: string; amount: string };

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

function computeAllocation(total: number, open: { id: string; balance: number; dueDate: string }[]): { lines: Map<string, number>; error: string | null } {
  if (total <= 0) return { lines: new Map(), error: null };
  try {
    const items = open.map((p) => ({ id: p.id, balance: p.balance, dueDate: new Date(p.dueDate) }));
    return { lines: new Map(allocatePayment(total, items).map((a) => [a.payableId, a.amount])), error: null };
  } catch (e) {
    return { lines: new Map(), error: e instanceof PurchasingError ? e.message : "Importe inválido" };
  }
}

export function PaymentOrderForm({ statement, canPay }: { statement: CreditorStatement; canPay: boolean }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(statement.open.map((p) => p.id)));
  const [rows, setRows] = useState<Row[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [notes, setNotes] = useState("");
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  const usable = statement.registers.filter((r) => !r.requiresSession || r.hasOpenSession);
  const banks = statement.registers.filter((r) => r.kind === "BANCO");
  const blackBox = statement.registers.find((r) => r.kind === "CAJA_RESGUARDO");
  const selectedTotal = statement.open.filter((p) => selected.has(p.id)).reduce((a, p) => a + p.balance, 0);
  const pendingToAssign = () => Math.max(0, Math.round((selectedTotal - instrumentsTotal) * 100) / 100);

  const chequeById = useMemo(() => new Map(statement.cheques.map((c) => [c.id, c])), [statement.cheques]);
  const rowAmount = (r: Row) => (r.type === "THIRD_CHEQUE" ? (chequeById.get(r.chequeId)?.amount ?? 0) : num(r.amount));
  const instrumentsTotal = rows.reduce((a, r) => a + rowAmount(r), 0);

  function add(type: Row["type"]) {
    const key = nextKey;
    setNextKey(key + 1);
    const rest = String(pendingToAssign() || "");
    if (type === "REGISTER") {
      const reg = blackBox ?? usable[0];
      setRows((r) => [...r, { key, type, cashRegisterId: reg?.id ?? "", method: reg ? DEFAULT_METHOD[reg.kind] : "EFECTIVO", amount: rest, reference: "" }]);
    } else if (type === "THIRD_CHEQUE") {
      const used = new Set(rows.flatMap((r) => (r.type === "THIRD_CHEQUE" ? [r.chequeId] : [])));
      const first = statement.cheques.find((c) => !used.has(c.id));
      setRows((r) => [...r, { key, type, chequeId: first?.id ?? "" }]);
    } else {
      setRows((r) => [...r, { key, type, format: "ECHEQ", bankRegisterId: banks[0]?.id ?? "", number: "", paymentDate: todayIso(), amount: rest }]);
    }
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? ({ ...r, ...patch } as Row) : r)));

  function toggle(pid: string) {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setSelected(next);
  }

  const allocation = computeAllocation(instrumentsTotal, statement.open.filter((p) => selected.has(p.id)));

  function toInstrument(r: Row): PaymentInstrument {
    if (r.type === "REGISTER") return { type: "REGISTER", method: r.method, cashRegisterId: r.cashRegisterId, amount: num(r.amount), reference: r.reference.trim() || null };
    if (r.type === "THIRD_CHEQUE") return { type: "THIRD_CHEQUE", chequeId: r.chequeId };
    return { type: "OWN_CHEQUE", format: r.format, bankRegisterId: r.bankRegisterId, number: r.number.trim(), paymentDate: r.paymentDate, amount: num(r.amount) };
  }

  const printLink = lastOrder && status?.kind === "success" && (
    <Button asChild variant="outline">
      <Link href={`/compras/pagos/${lastOrder}`} target="_blank">
        <Printer /> Imprimir orden de pago
      </Link>
    </Button>
  );

  if (statement.open.length === 0) {
    return (
      <div className="flex flex-col gap-3 px-5 pb-5">
        <StatusMessage status={status} />
        {printLink}
        <p className="text-sm text-muted-foreground">No hay comprobantes pendientes de pago.</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(
          () =>
            createPaymentOrderAction({
              creditorType: statement.type === "proveedor" ? "SUPPLIER" : "WORKSHOP",
              creditorId: statement.id,
              payableIds: [...selected],
              instruments: rows.map(toInstrument),
              notes: notes.trim() || null,
            }),
          (d) => {
            setLastOrder(d.id);
            setRows([]);
            setNotes("");
          },
        );
      }}
    >
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 pl-5">
              <span className="sr-only">Pagar</span>
            </TableHead>
            <TableHead>Comprobante</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="pr-5 text-right">Se imputa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.open.map((p) => {
            const bucket = agingBucket(new Date(p.dueDate));
            return (
              <TableRow key={p.id}>
                <TableCell className="pl-5">
                  {canPay && (
                    <input type="checkbox" aria-label={`Pagar ${p.description}`} className="size-4 accent-[var(--primary)]" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  )}
                </TableCell>
                <TableCell>
                  {p.description}
                  {p.provisional && (
                    <span className="ml-2">
                      <Badge variant="outline">Provisoria (sin factura)</Badge>
                    </span>
                  )}
                </TableCell>
                <TableCell className={bucket === "A_VENCER" ? undefined : "font-medium text-destructive"}>
                  {new Date(p.dueDate).toLocaleDateString("es-AR")}
                  <span className="block text-xs">{AGING_LABELS[bucket]}</span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.balance)}</TableCell>
                <TableCell className="pr-5 text-right font-mono tabular-nums">{allocation.lines.has(p.id) ? formatMoney(allocation.lines.get(p.id)!) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {canPay && (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Con qué se paga</h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => add("REGISTER")}>
                <Banknote /> Efectivo / transferencia
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => add("THIRD_CHEQUE")} disabled={statement.cheques.length === 0}>
                <FileText /> Endosar cheque de terceros
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => add("OWN_CHEQUE")} disabled={banks.length === 0}>
                <Wallet /> Cheque propio / eCheq
              </Button>
            </div>
          </div>

          {rows.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Agregá uno o más medios. El efectivo sale de caja negra; las cajas diarias de local solo aparecen si tienen el turno abierto.
            </p>
          )}

          {rows.map((r) => (
            <div key={r.key} className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              {r.type === "REGISTER" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-${r.key}-reg`}>Sale de</Label>
                    <NativeSelect
                      id={`${id}-${r.key}-reg`}
                      value={r.cashRegisterId}
                      onChange={(e) => {
                        const reg = usable.find((x) => x.id === e.target.value);
                        update(r.key, { cashRegisterId: e.target.value, ...(reg && { method: DEFAULT_METHOD[reg.kind] }) });
                      }}
                    >
                      {usable.map((reg) => (
                        <option key={reg.id} value={reg.id}>
                          {reg.name} — saldo {formatMoney(reg.balance, { round: true })}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-${r.key}-m`}>Medio</Label>
                    <NativeSelect id={`${id}-${r.key}-m`} value={r.method} onChange={(e) => update(r.key, { method: e.target.value as (typeof PAYMENT_METHODS)[number] })}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
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
                    <Label htmlFor={`${id}-${r.key}-ch`}>Cheque de terceros en cartera</Label>
                    <NativeSelect id={`${id}-${r.key}-ch`} value={r.chequeId} onChange={(e) => update(r.key, { chequeId: e.target.value })}>
                      {statement.cheques
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
                    <span className="flex h-10 items-center justify-end font-mono tabular-nums">{formatMoney(rowAmount(r))}</span>
                  </div>
                </>
              )}
              {r.type === "OWN_CHEQUE" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-${r.key}-b`}>Cuenta</Label>
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
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar medio" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <Trash2 />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Seleccionado <strong className="font-mono">{formatMoney(selectedTotal)}</strong> · a pagar{" "}
              <strong className="font-mono">{formatMoney(instrumentsTotal)}</strong>
              {instrumentsTotal > 0 && instrumentsTotal < selectedTotal && <span className="text-muted-foreground"> · queda {formatMoney(selectedTotal - instrumentsTotal)} pendiente</span>}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-notes`}>Observaciones</Label>
            <Input id={`${id}-notes`} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {allocation.error && <p className="text-sm text-destructive">{allocation.error}</p>}
          <StatusMessage status={status} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !!allocation.error || selected.size === 0 || rows.length === 0 || instrumentsTotal <= 0}>
              {pending && <Loader2 className="animate-spin" />} Registrar orden de pago
            </Button>
            {printLink}
          </div>
        </div>
      )}
    </form>
  );
}
