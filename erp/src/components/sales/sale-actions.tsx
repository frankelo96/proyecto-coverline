"use client";

import { ArrowLeftRight, Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatNumber } from "@/lib/format";
import { exchangeSaleItemAction, voidSaleAction } from "@/server/actions/treasury.actions";
import type { SaleDetail } from "@/server/queries/sales.queries";

/** Anular una venta sin CAE (pide motivo y confirmación). */
export function VoidSaleForm({ saleId, number }: { saleId: string; number: number }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, status, execute } = useServerAction();

  if (!open) {
    return (
      <Button variant="outline" className="w-fit text-destructive" onClick={() => setOpen(true)}>
        <Ban /> Anular venta
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => voidSaleAction({ saleId, reason: reason.trim() }), (_d, message) => router.replace(`/ventas/${saleId}?aviso=${encodeURIComponent(message)}`));
      }}
    >
      <p className="text-sm text-muted-foreground">
        Se anula la venta #{number}: la mercadería vuelve al stock, el dinero sale de la caja o cuenta donde entró, los cheques en cartera se anulan, los vales recuperan el saldo y se
        cancela la deuda en cuenta corriente.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-r`}>Motivo *</Label>
        <Input id={`${id}-r`} maxLength={300} placeholder="Ej. venta cargada por error, el cliente se arrepintió" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <StatusMessage status={status} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 5}>
          {pending ? <Loader2 className="animate-spin" /> : <Ban />} Confirmar anulación
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Cambio de talle de la misma prenda y mismo precio: entra lo devuelto y sale lo nuevo. */
export function ExchangeForm({ sale, branches, defaultBranchId, lockedBranch }: { sale: SaleDetail; branches: { id: string; name: string }[]; defaultBranchId: string; lockedBranch: boolean }) {
  const id = useId();
  const router = useRouter();
  const items = sale.items.filter((i) => i.isProduct && i.returnable > 0 && i.exchangeOptions.length > 0);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [branchId, setBranchId] = useState(defaultBranchId);
  const { pending, status, execute } = useServerAction();
  const item = items.find((i) => i.id === itemId);

  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay prendas con otros talles al mismo precio para cambiar.</p>;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        execute(
          () => exchangeSaleItemAction({ saleId: sale.id, itemId, newVariantId: variantId, quantity: Number(qty.replace(",", ".")), branchId }),
          (_d, message) => {
            setVariantId("");
            router.replace(`/ventas/${sale.id}?aviso=${encodeURIComponent(message)}`);
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-i`}>Prenda que devuelve</Label>
          <NativeSelect
            id={`${id}-i`}
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              setVariantId("");
            }}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.description} ({formatNumber(i.returnable)} u.)
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-v`}>Se lleva</Label>
          <NativeSelect id={`${id}-v`} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">Elegí el talle…</option>
            {item?.exchangeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} — stock {formatNumber(o.stocks[branchId] ?? 0)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-q`}>Cantidad</Label>
          <Input id={`${id}-q`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-b`}>Local donde se hace el cambio</Label>
          <NativeSelect id={`${id}-b`} value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={lockedBranch}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sin cobro ni comprobante nuevo. Si el talle tiene otro precio o es otra prenda, hacé una devolución con vale y una venta nueva.</p>
      <StatusMessage status={status} />
      <Button type="submit" className="w-fit" disabled={pending || !variantId || !(Number(qty.replace(",", ".")) > 0)}>
        {pending ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />} Registrar cambio
      </Button>
    </form>
  );
}
