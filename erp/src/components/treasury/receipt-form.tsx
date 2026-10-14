"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { CollectionPayments, rowsTotal, toCollectionPayload, type PayRow } from "@/components/treasury/collection-payments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { agingBucket, AGING_LABELS } from "@/lib/purchasing/math";
import { UI_COLLECTION_METHODS } from "@/lib/validations/treasury";
import { createReceiptAction } from "@/server/actions/treasury.actions";
import type { ClientAccount } from "@/server/queries/treasury.queries";

const METHODS = UI_COLLECTION_METHODS.filter((m) => m !== "CUENTA_CORRIENTE");

export function ReceiptForm({ account }: { account: ClientAccount }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(account.open.map((d) => d.id)));
  const [payments, setPayments] = useState<PayRow[]>([]);
  const defaultRegister = account.registers.find((r) => r.kind === "CAJA_RESGUARDO") ?? account.registers[0];
  const [registerId, setRegisterId] = useState(defaultRegister?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const due = account.open.filter((d) => selected.has(d.id)).reduce((a, d) => a + d.balance, 0);
  const paid = rowsTotal(payments);

  function toggle(did: string) {
    const next = new Set(selected);
    if (next.has(did)) next.delete(did);
    else next.add(did);
    setSelected(next);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(
          () => createReceiptAction({ clientId: account.client.id, registerId, receivableIds: [...selected], payments: toCollectionPayload(payments), notes: notes.trim() || null }),
          (d) => {
            setLastReceipt(d.id);
            setPayments([]);
            setNotes("");
          },
        );
      }}
    >
      {account.open.length > 0 && (
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 pl-5">
                <span className="sr-only">Cobrar</span>
              </TableHead>
              <TableHead>Deuda</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="pr-5 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {account.open.map((d) => {
              const bucket = agingBucket(new Date(d.dueDate));
              return (
                <TableRow key={d.id}>
                  <TableCell className="pl-5">
                    <input type="checkbox" aria-label={`Cobrar ${d.description}`} className="size-4 accent-[var(--primary)]" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  </TableCell>
                  <TableCell>
                    {d.description}
                    {d.fromCheque && (
                      <span className="ml-2">
                        <Badge variant="destructive">Cheque rechazado</Badge>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={bucket === "A_VENCER" ? undefined : "font-medium text-destructive"}>
                    {new Date(d.dueDate).toLocaleDateString("es-AR")}
                    <span className="block text-xs">{AGING_LABELS[bucket]}</span>
                  </TableCell>
                  <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(d.balance)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-col gap-4 px-5 pb-5">
        {account.open.length === 0 ? (
          <p className="text-sm text-muted-foreground">El cliente no tiene deudas pendientes.</p>
        ) : (
          <>
            <div className="flex max-w-md flex-col gap-2">
              <Label htmlFor={`${id}-reg`}>El efectivo ingresa a</Label>
              <NativeSelect id={`${id}-reg`} value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
                {account.registers
                  .filter((r) => r.kind !== "BANCO" && r.kind !== "BILLETERA_VIRTUAL")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">Transferencias, tarjetas y QR se acreditan en su cuenta; los cheques quedan en cartera.</p>
            </div>
            <CollectionPayments rows={payments} onChange={setPayments} methods={METHODS} due={due} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-n`}>Observaciones</Label>
              <Input id={`${id}-n`} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </>
        )}
        <StatusMessage status={status} />
        <div className="flex flex-wrap gap-2">
          {account.open.length > 0 && (
            <Button type="submit" disabled={pending || payments.length === 0 || selected.size === 0 || paid <= 0 || paid > due + 0.004 || !registerId}>
              {pending && <Loader2 className="animate-spin" />} Registrar cobranza {paid > 0 && formatMoney(paid)}
            </Button>
          )}
          {lastReceipt && status?.kind === "success" && (
            <Button asChild variant="outline">
              <Link href={`/tesoreria/recibos/${lastReceipt}`} target="_blank">
                <Printer /> Imprimir recibo
              </Link>
            </Button>
          )}
        </div>
        {paid > due + 0.004 && <p className="text-sm text-destructive">El cobro supera las deudas elegidas.</p>}
      </div>
    </form>
  );
}
