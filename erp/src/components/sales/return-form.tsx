"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney, formatNumber } from "@/lib/format";
import { REFUND_METHODS } from "@/lib/validations/returns";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { createReturnAction } from "@/server/actions/treasury.actions";
import type { SaleDetail } from "@/server/queries/sales.queries";

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

export function ReturnForm({ sale }: { sale: SaleDetail }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>(() => Object.fromEntries(sale.items.map((i) => [i.id, true])));
  const [reason, setReason] = useState("");
  const [registerId, setRegisterId] = useState(sale.openRegisters[0]?.id ?? "");
  const methods = REFUND_METHODS.filter((m) => m !== "CUENTA_CORRIENTE" || sale.accountDebt > 0);
  const [method, setMethod] = useState<(typeof REFUND_METHODS)[number]>(sale.accountDebt > 0 ? "CUENTA_CORRIENTE" : "EFECTIVO");
  const [reference, setReference] = useState("");
  const [last, setLast] = useState<string | null>(null);

  // Estimación en pantalla (el servidor recalcula exacto contra lo cobrado).
  const estimate = sale.items.reduce((a, i) => a + (i.quantity > 0 ? (i.total * Math.min(num(qty[i.id] ?? "0"), i.returnable)) / i.quantity : 0), 0);
  const any = sale.items.some((i) => num(qty[i.id] ?? "0") > 0);
  const over = sale.items.some((i) => num(qty[i.id] ?? "0") > i.returnable + 1e-9);

  if (sale.openRegisters.length === 0) {
    return <p className="px-5 pb-5 text-sm text-muted-foreground">Para registrar una devolución tiene que haber un turno abierto en alguna caja diaria.</p>;
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(
          () =>
            createReturnAction({
              originalSaleId: sale.id,
              registerId,
              items: sale.items.map((i) => ({ originalItemId: i.id, quantity: num(qty[i.id] ?? "0"), restock: restock[i.id] ?? false })),
              reason: reason.trim(),
              refundMethod: method,
              reference: reference.trim() || null,
            }),
          // Se abre el comprobante de la devolución con el resultado (CAE o pendiente).
          (d, message) => {
            setLast(d.id);
            router.push(`/ventas/${d.id}?aviso=${encodeURIComponent(message)}`);
          },
        );
      }}
    >
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Artículo</TableHead>
            <TableHead className="text-right">Vendido</TableHead>
            <TableHead className="text-right">Se puede devolver</TableHead>
            <TableHead className="text-right">Devuelve</TableHead>
            <TableHead className="pr-5">Vuelve al stock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sale.items.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="pl-5">{i.description}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatNumber(i.quantity)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatNumber(i.returnable)}</TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={i.returnable}
                  step="0.01"
                  aria-label={`Cantidad a devolver de ${i.description}`}
                  disabled={i.returnable <= 0}
                  className="ml-auto w-24 text-right"
                  value={qty[i.id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                />
              </TableCell>
              <TableCell className="pr-5">
                {i.isProduct ? (
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={restock[i.id] ?? false} onChange={(e) => setRestock((r) => ({ ...r, [i.id]: e.target.checked }))} />
                    {restock[i.id] ? "Sí" : "No (fallado)"}
                  </label>
                ) : (
                  <span className="text-sm text-muted-foreground">Ítem libre</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="grid gap-4 px-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={`${id}-r`}>Motivo *</Label>
          <Input id={`${id}-r`} maxLength={300} placeholder="Ej. cambio de talle, falla de confección" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-m`}>Reintegro</Label>
          <NativeSelect id={`${id}-m`} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m === "CUENTA_CORRIENTE" ? `Descontar de la deuda (${formatMoney(sale.accountDebt)})` : METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-c`}>Caja del turno</Label>
          <NativeSelect id={`${id}-c`} value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            {sale.openRegisters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {(method === "TRANSFERENCIA" || method === "MERCADO_PAGO") && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor={`${id}-ref`}>Referencia</Label>
            <Input id={`${id}-ref`} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="text-sm">
          A reintegrar (aprox.): <strong className="font-mono">{formatMoney(estimate)}</strong>
          {over && <span className="text-destructive"> · hay cantidades mayores a lo que se puede devolver</span>}
        </p>
        {sale.invoiceType !== "TICKET_INTERNO" && <p className="text-xs text-muted-foreground">Se emite una nota de crédito electrónica asociada a esta factura.</p>}
        <StatusMessage status={status} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !any || over || reason.trim().length < 5 || !registerId}>
            {pending && <Loader2 className="animate-spin" />} Registrar devolución
          </Button>
          {last && status?.kind === "success" && (
            <Button asChild variant="outline">
              <Link href={`/pos/tickets/${last}`} target="_blank">
                <Printer /> Imprimir comprobante
              </Link>
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
