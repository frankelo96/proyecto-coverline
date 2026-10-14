"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { type InstrumentRow, instrumentsTotal as sumInstruments, PaymentInstruments, toInstrument } from "@/components/purchasing/payment-instruments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { agingBucket, AGING_LABELS, allocatePayment, PurchasingError } from "@/lib/purchasing/math";
import { createPaymentOrderAction } from "@/server/actions/purchasing.actions";
import type { CreditorStatement } from "@/server/queries/purchasing.queries";

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
  const [rows, setRows] = useState<InstrumentRow[]>([]);
  const [notes, setNotes] = useState("");
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  const selectedTotal = statement.open.filter((p) => selected.has(p.id)).reduce((a, p) => a + p.balance, 0);
  const instrumentsTotal = sumInstruments(rows, statement);

  function toggle(pid: string) {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setSelected(next);
  }

  const allocation = computeAllocation(instrumentsTotal, statement.open.filter((p) => selected.has(p.id)));

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
          <PaymentInstruments sources={statement} rows={rows} onChange={setRows} suggested={selectedTotal} />

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
