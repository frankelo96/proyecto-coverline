"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { agingBucket, AGING_LABELS, allocatePayment, PurchasingError } from "@/lib/purchasing/math";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/validations/purchasing";
import { createPaymentOrderAction } from "@/server/actions/purchasing.actions";
import type { CreditorStatement } from "@/server/queries/purchasing.queries";

/** Medio sugerido según el tipo de caja/cuenta. */
const DEFAULT_METHOD = { CAJA_DIARIA: "EFECTIVO", CAJA_ADMINISTRATIVA: "EFECTIVO", BILLETERA_VIRTUAL: "MERCADO_PAGO", BANCO: "TRANSFERENCIA" } as const;

export function PaymentOrderForm({ statement, canPay }: { statement: CreditorStatement; canPay: boolean }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(statement.open.map((p) => p.id)));
  const selectedTotal = statement.open.filter((p) => selected.has(p.id)).reduce((a, p) => a + p.balance, 0);
  const [amount, setAmount] = useState(String(Math.round(selectedTotal * 100) / 100));
  const bank = statement.registers.find((r) => r.kind === "BANCO") ?? statement.registers[0];
  const [registerId, setRegisterId] = useState(bank?.id ?? "");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>(bank ? DEFAULT_METHOD[bank.kind] : "TRANSFERENCIA");
  const [reference, setReference] = useState("");
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  function toggle(pid: string) {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setSelected(next);
    const total = statement.open.filter((p) => next.has(p.id)).reduce((a, p) => a + p.balance, 0);
    setAmount(String(Math.round(total * 100) / 100));
  }

  const allocation = useMemo(() => {
    try {
      const open = statement.open.filter((p) => selected.has(p.id)).map((p) => ({ id: p.id, balance: p.balance, dueDate: new Date(p.dueDate) }));
      return { lines: new Map(allocatePayment(Number(amount), open).map((a) => [a.payableId, a.amount])), error: null };
    } catch (e) {
      return { lines: new Map<string, number>(), error: e instanceof PurchasingError ? e.message : "Importe inválido" };
    }
  }, [amount, selected, statement.open]);

  if (statement.open.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <StatusMessage status={status} />
        {lastOrder && (
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/compras/pagos/${lastOrder}`} target="_blank">
              <Printer /> Imprimir orden de pago
            </Link>
          </Button>
        )}
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
              amount: Number(amount),
              method,
              cashRegisterId: registerId,
              reference: reference.trim() || null,
              notes: null,
            }),
          (d) => {
            setLastOrder(d.id);
            setReference("");
            setAmount("");
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
                    <input
                      type="checkbox"
                      aria-label={`Pagar ${p.description}`}
                      className="size-4 accent-[var(--primary)]"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
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
                <TableCell className="pr-5 text-right font-mono tabular-nums">
                  {allocation.lines.has(p.id) ? formatMoney(allocation.lines.get(p.id)!) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {canPay && (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-amount`}>Importe a pagar</Label>
              <Input id={`${id}-amount`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Seleccionado: {formatMoney(selectedTotal)}. Se imputa del vencimiento más viejo al más nuevo.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-reg`}>Sale de</Label>
              <NativeSelect
                id={`${id}-reg`}
                value={registerId}
                onChange={(e) => {
                  setRegisterId(e.target.value);
                  const r = statement.registers.find((x) => x.id === e.target.value);
                  if (r) setMethod(DEFAULT_METHOD[r.kind]);
                }}
              >
                {statement.registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-method`}>Medio de pago</Label>
              <NativeSelect id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-ref`}>Referencia</Label>
              <Input id={`${id}-ref`} placeholder="N° de transferencia, cheque…" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          {allocation.error && selected.size > 0 && amount !== "" && <p className="text-sm text-destructive">{allocation.error}</p>}
          <StatusMessage status={status} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !!allocation.error || selected.size === 0 || !registerId}>
              {pending && <Loader2 className="animate-spin" />} Registrar orden de pago
            </Button>
            {lastOrder && status?.kind === "success" && (
              <Button asChild variant="outline">
                <Link href={`/compras/pagos/${lastOrder}`} target="_blank">
                  <Printer /> Imprimir orden de pago
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
