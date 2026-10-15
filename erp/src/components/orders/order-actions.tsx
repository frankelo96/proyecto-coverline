"use client";

import { Ban, CheckCircle2, Factory, HandCoins, Loader2, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { CollectionPayments, newPayRow, rowsTotal, toCollectionPayload, type PayRow } from "@/components/treasury/collection-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney, formatNumber } from "@/lib/format";
import { CANCEL_REFUND_LABELS, CANCEL_REFUNDS } from "@/lib/validations/orders";
import { UI_COLLECTION_METHODS } from "@/lib/validations/treasury";
import { addDepositAction, cancelOrderAction, deliverOrderAction, setOrderStatusAction, startOrderProductionAction } from "@/server/actions/orders.actions";
import type { OrderDetail } from "@/server/queries/orders.queries";

const DEPOSIT_METHODS = UI_COLLECTION_METHODS.filter((m) => m !== "CUENTA_CORRIENTE");

function useReload(orderId: string) {
  const router = useRouter();
  return (message: string) => router.replace(`/ventas/pedidos/${orderId}?aviso=${encodeURIComponent(message)}`);
}

function DrawerSelect({ id, order, value, onChange }: { id: string; order: OrderDetail; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Caja</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {order.drawers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function DepositForm({ order }: { order: OrderDetail }) {
  const id = useId();
  const reload = useReload(order.id);
  const [registerId, setRegisterId] = useState(order.drawers.find((d) => d.branchId === order.branch?.id)?.id ?? order.drawers[0]?.id ?? "");
  const [payments, setPayments] = useState<PayRow[]>(() => [newPayRow("EFECTIVO", order.balance)]);
  const { pending, status, execute } = useServerAction();
  if (order.drawers.length === 0) return <p className="text-sm text-muted-foreground">Para cobrar una seña tiene que haber un turno abierto en una caja diaria.</p>;
  return (
    <div className="flex flex-col gap-3">
      <DrawerSelect id={`${id}-r`} order={order} value={registerId} onChange={setRegisterId} />
      <CollectionPayments rows={payments} onChange={setPayments} methods={DEPOSIT_METHODS} due={order.balance} />
      <StatusMessage status={status} />
      <Button
        className="w-fit"
        disabled={pending || payments.length === 0 || rowsTotal(payments) <= 0}
        onClick={() => execute(() => addDepositAction({ orderId: order.id, registerId, payments: toCollectionPayload(payments) }), (_d, m) => reload(m))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <HandCoins />} Cobrar {formatMoney(rowsTotal(payments))}
      </Button>
    </div>
  );
}

export function ProductionButton({ orderId }: { orderId: string }) {
  const reload = useReload(orderId);
  const [personalization, setPersonalization] = useState(false);
  const { pending, status, execute } = useServerAction();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={personalization} onChange={(e) => setPersonalization(e.target.checked)} /> Lleva bordado / estampado / sublimación
      </label>
      <StatusMessage status={status} />
      <Button
        variant="outline"
        className="w-fit"
        disabled={pending}
        onClick={() => execute(() => startOrderProductionAction({ orderId, requiresPersonalization: personalization }), (_d, m) => reload(m))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Factory />} Crear órdenes de producción
      </Button>
    </div>
  );
}

export function StatusButtons({ order }: { order: OrderDetail }) {
  const reload = useReload(order.id);
  const { pending, status, execute } = useServerAction();
  if (order.status === "LISTO") return null;
  return (
    <div className="flex flex-col gap-2">
      <StatusMessage status={status} />
      <Button variant="outline" className="w-fit" disabled={pending} onClick={() => execute(() => setOrderStatusAction({ orderId: order.id, status: "LISTO" }), (_d, m) => reload(m))}>
        {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Marcar listo para entregar
      </Button>
    </div>
  );
}

export function DeliverForm({ order }: { order: OrderDetail }) {
  const id = useId();
  const reload = useReload(order.id);
  const [registerId, setRegisterId] = useState(order.drawers.find((d) => d.branchId === order.branch?.id)?.id ?? order.drawers[0]?.id ?? "");
  const [stockBranchId, setStockBranchId] = useState(order.defaultStockBranchId);
  const [invoiceType, setInvoiceType] = useState<"TICKET_INTERNO" | "FACTURA_B" | "FACTURA_A">(order.client.canInvoiceA ? "FACTURA_A" : "TICKET_INTERNO");
  const [payments, setPayments] = useState<PayRow[]>(() => (order.balance > 0 ? [newPayRow("EFECTIVO", order.balance)] : []));
  const { pending, status, execute } = useServerAction();
  const methods = UI_COLLECTION_METHODS.filter((m) => m !== "CUENTA_CORRIENTE" || order.client.creditLimit > 0);
  const short = order.items.filter((i) => i.variantId && (i.stocks[stockBranchId] ?? 0) < i.quantity);

  if (order.drawers.length === 0) return <p className="text-sm text-muted-foreground">Para entregar tiene que haber un turno abierto en una caja diaria.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <DrawerSelect id={`${id}-r`} order={order} value={registerId} onChange={setRegisterId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-s`}>La mercadería sale de</Label>
          <NativeSelect id={`${id}-s`} value={stockBranchId} onChange={(e) => setStockBranchId(e.target.value)}>
            {order.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-i`}>Comprobante</Label>
          <NativeSelect id={`${id}-i`} value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}>
            <option value="TICKET_INTERNO">Ticket</option>
            <option value="FACTURA_B">Factura B</option>
            <option value="FACTURA_A" disabled={!order.client.canInvoiceA}>
              Factura A{order.client.canInvoiceA ? "" : " (cliente RI con CUIT)"}
            </option>
          </NativeSelect>
        </div>
      </div>
      {short.length > 0 && (
        <p className="text-sm text-destructive">
          Falta stock en ese local: {short.map((i) => `${i.description} (hay ${formatNumber(i.stocks[stockBranchId] ?? 0)}, se entregan ${formatNumber(i.quantity)})`).join("; ")}. Se puede entregar igual, queda en negativo.
        </p>
      )}
      <p className="text-sm">
        Total {formatMoney(order.total)} − seña {formatMoney(order.deposited)} = <strong>saldo {formatMoney(Math.max(0, order.balance))}</strong>
      </p>
      {order.balance > 0 && <CollectionPayments rows={payments} onChange={setPayments} methods={methods} due={order.balance} />}
      <StatusMessage status={status} />
      <Button
        className="w-fit"
        disabled={pending || (order.balance > 0 && payments.length === 0)}
        onClick={() =>
          execute(
            () => deliverOrderAction({ orderId: order.id, registerId, stockBranchId, invoiceType, payments: order.balance > 0 ? toCollectionPayload(payments) : [] }),
            (_d, m) => reload(m),
          )
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Entregar y generar la venta
      </Button>
    </div>
  );
}

export function CancelForm({ order }: { order: OrderDetail }) {
  const id = useId();
  const reload = useReload(order.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<(typeof CANCEL_REFUNDS)[number]>(order.deposited > 0 ? "VALE" : "RETENER");
  const [registerId, setRegisterId] = useState(order.drawers[0]?.id ?? "");
  const { pending, status, execute } = useServerAction();
  if (!open) {
    return (
      <Button variant="outline" className="w-fit text-destructive" onClick={() => setOpen(true)}>
        <Ban /> Cancelar pedido
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-m`}>Motivo *</Label>
        <Input id={`${id}-m`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {order.deposited > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-f`}>Seña cobrada ({formatMoney(order.deposited)})</Label>
            <NativeSelect id={`${id}-f`} value={refund} onChange={(e) => setRefund(e.target.value as typeof refund)}>
              {CANCEL_REFUNDS.map((r) => (
                <option key={r} value={r}>
                  {CANCEL_REFUND_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {refund === "EFECTIVO" && <DrawerSelect id={`${id}-r`} order={order} value={registerId} onChange={setRegisterId} />}
        </div>
      )}
      <StatusMessage status={status} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          disabled={pending || reason.trim().length < 5 || (refund === "EFECTIVO" && order.deposited > 0 && !registerId)}
          onClick={() =>
            execute(
              () => cancelOrderAction({ orderId: order.id, reason: reason.trim(), refund: order.deposited > 0 ? refund : "RETENER", registerId: refund === "EFECTIVO" ? registerId : null }),
              (_d, m) => reload(m),
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Ban />} Confirmar cancelación
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Volver
        </Button>
      </div>
    </div>
  );
}
