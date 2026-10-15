"use client";

import { Copy, Loader2, PackagePlus, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { CollectionPayments, newPayRow, rowsTotal, toCollectionPayload, type PayRow } from "@/components/treasury/collection-payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { listFinalPrice } from "@/lib/pos/price-lists";
import { computeSaleTotals } from "@/lib/pos/sale-math";
import { UI_COLLECTION_METHODS } from "@/lib/validations/treasury";
import { createOrderAction } from "@/server/actions/orders.actions";
import type { OrderFormData } from "@/server/queries/orders.queries";

interface Line {
  key: number;
  productId: string;
  variantId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  /** El precio se cargó a mano (presupuesto o precio especial): no se recalcula al cambiar de talle o cliente */
  manualPrice: boolean;
}

let seq = 1;
const n = (v: string) => parseLocaleNumber(v || "0") ?? 0;
const show = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
const METHODS = UI_COLLECTION_METHODS.filter((m) => m !== "CUENTA_CORRIENTE");

export function OrderForm({ data, canDiscount, today }: { data: OrderFormData; canDiscount: boolean; today: string }) {
  const id = useId();
  const router = useRouter();
  const [clientId, setClientId] = useState(data.quote?.clientId ?? "");
  const [branchId, setBranchId] = useState(data.branches[0]?.id ?? "");
  const [promisedDate, setPromisedDate] = useState("");
  const [notes, setNotes] = useState(data.quote?.notes ?? "");
  const [discountReason, setDiscountReason] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    data.quote?.items.length
      ? data.quote.items.map((i) => ({
          key: seq++,
          productId: i.productId ?? "",
          variantId: "",
          description: i.description,
          quantity: show(i.quantity),
          unitPrice: show(i.unitPrice),
          discountPct: show(i.discountPct),
          manualPrice: true,
        }))
      : [],
  );
  const [withDeposit, setWithDeposit] = useState(false);
  const [registerId, setRegisterId] = useState(data.drawers.find((d) => d.branchId === branchId)?.id ?? data.drawers[0]?.id ?? "");
  const [payments, setPayments] = useState<PayRow[]>([]);
  const { pending, status, setStatus, execute } = useServerAction();

  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const list = data.priceLists.find((l) => l.id === client?.priceListId) ?? null;
  const productsById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  function priceFor(productId: string, variantId: string, l = list) {
    const p = productsById.get(productId);
    const v = p?.variants.find((x) => x.id === variantId);
    return p && v ? listFinalPrice(p.netPrice, p.vatRate, v.sizeAdjustmentPct, p.id, l) : null;
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function setVariant(line: Line, variantId: string) {
    const price = priceFor(line.productId, variantId);
    update(line.key, { variantId, ...(price !== null && !line.manualPrice ? { unitPrice: show(price) } : {}) });
  }

  function changeClient(next: string) {
    setClientId(next);
    const nextList = data.priceLists.find((l) => l.id === data.clients.find((c) => c.id === next)?.priceListId) ?? null;
    setLines((ls) =>
      ls.map((l) => {
        const price = l.variantId && !l.manualPrice ? priceFor(l.productId, l.variantId, nextList) : null;
        return price !== null ? { ...l, unitPrice: show(price) } : l;
      }),
    );
  }

  const totals = useMemo(() => {
    try {
      return computeSaleTotals(lines.map((l) => ({ quantity: n(l.quantity), unitPrice: n(l.unitPrice), discountPct: n(l.discountPct), vatRate: productsById.get(l.productId)?.vatRate ?? 21 })));
    } catch {
      return null;
    }
  }, [lines, productsById]);
  const hasDiscount = lines.some((l) => n(l.discountPct) > 0);
  const deposit = withDeposit ? rowsTotal(payments) : 0;

  function submit() {
    const missing = lines.find((l) => l.productId && !l.variantId);
    if (missing) {
      setStatus({ kind: "error", text: `Elegí el talle de "${missing.description || productsById.get(missing.productId)?.name}"` });
      return;
    }
    execute(
      () =>
        createOrderAction({
          clientId,
          quoteId: data.quote?.id ?? null,
          branchId,
          promisedDate: promisedDate || null,
          notes: notes.trim() || null,
          discountReason: hasDiscount ? discountReason.trim() || null : null,
          items: lines.map((l) => ({
            productId: l.productId || null,
            variantId: l.variantId || null,
            description: l.description.trim(),
            quantity: n(l.quantity),
            unitPrice: n(l.unitPrice),
            discountPct: n(l.discountPct),
          })),
          deposit: withDeposit && payments.length ? { registerId, payments: toCollectionPayload(payments) } : null,
        }),
      (d, message) => router.push(`/ventas/pedidos/${d.id}?aviso=${encodeURIComponent(message)}`),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Cliente y entrega</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-c`}>Cliente *</Label>
            <NativeSelect id={`${id}-c`} value={clientId} onChange={(e) => changeClient(e.target.value)}>
              <option value="">Elegí el cliente…</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.document ? ` (${c.document})` : ""}
                </option>
              ))}
            </NativeSelect>
            {list && <p className="text-xs font-medium text-accent-strong">Lista de precios del cliente: {list.name}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-b`}>Local que toma el pedido</Label>
            <NativeSelect id={`${id}-b`} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-d`}>Fecha prometida de entrega</Label>
            <Input id={`${id}-d`} type="date" min={today} value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-n`}>Notas (bordado, logo, detalles)</Label>
            <Textarea id={`${id}-n`} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artículos{data.quote ? ` (del presupuesto #${data.quote.number})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.quote && <p className="text-sm text-muted-foreground">Se copiaron los precios del presupuesto. Elegí el talle de cada línea; si son varios talles, usá «Otro talle» para dividir la cantidad.</p>}
          {lines.map((l) => {
            const p = productsById.get(l.productId);
            return (
              <div key={l.key} className="grid items-end gap-2 rounded-md border p-3 md:grid-cols-[2fr_1.4fr_0.6fr_1fr_0.6fr_auto]">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{p ? "Producto" : "Ítem libre"}</Label>
                  {p ? (
                    <NativeSelect
                      aria-label="Producto"
                      value={l.productId}
                      onChange={(e) => update(l.key, { productId: e.target.value, variantId: "", manualPrice: false })}
                    >
                      {data.products.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.sku})
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input aria-label="Descripción" maxLength={200} value={l.description} placeholder="Ej. bordado de logo" onChange={(e) => update(l.key, { description: e.target.value })} />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Talle / color</Label>
                  {p ? (
                    <NativeSelect aria-label="Talle" value={l.variantId} onChange={(e) => setVariant(l, e.target.value)} aria-invalid={!l.variantId || undefined}>
                      <option value="">Elegí…</option>
                      {p.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <span className="h-10 text-sm leading-10 text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Cant.</Label>
                  <Input aria-label="Cantidad" inputMode="decimal" className="text-right" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Precio c/IVA</Label>
                  <Input
                    aria-label="Precio unitario"
                    inputMode="decimal"
                    className="text-right"
                    value={l.unitPrice}
                    disabled={!canDiscount && !!p}
                    onChange={(e) => update(l.key, { unitPrice: e.target.value, manualPrice: true })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Desc. %</Label>
                  <Input aria-label="Descuento" inputMode="decimal" className="text-right" value={l.discountPct} disabled={!canDiscount} onChange={(e) => update(l.key, { discountPct: e.target.value })} />
                </div>
                <div className="flex gap-1">
                  {p && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Otro talle del mismo producto"
                      aria-label="Otro talle"
                      onClick={() => setLines((ls) => [...ls.slice(0, ls.indexOf(l) + 1), { ...l, key: seq++, variantId: "", quantity: "1" }, ...ls.slice(ls.indexOf(l) + 1)])}
                    >
                      <Copy />
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar línea" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              aria-label="Agregar producto"
              className="w-80"
              value=""
              onChange={(e) => {
                if (e.target.value) setLines((ls) => [...ls, { key: seq++, productId: e.target.value, variantId: "", description: "", quantity: "1", unitPrice: "", discountPct: "0", manualPrice: false }]);
              }}
            >
              <option value="">+ Agregar producto…</option>
              {data.products.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.sku})
                </option>
              ))}
            </NativeSelect>
            {canDiscount && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setLines((ls) => [...ls, { key: seq++, productId: "", variantId: "", description: "", quantity: "1", unitPrice: "", discountPct: "0", manualPrice: true }])}
              >
                <PackagePlus /> Ítem libre
              </Button>
            )}
          </div>
          {hasDiscount && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-dr`}>Motivo del descuento *</Label>
              <Input id={`${id}-dr`} maxLength={200} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
            </div>
          )}
          {totals && (
            <p className="self-end text-lg">
              Total del pedido: <strong className="font-mono">{formatMoney(totals.total)}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seña</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={withDeposit}
              onChange={(e) => {
                setWithDeposit(e.target.checked);
                if (e.target.checked && payments.length === 0 && totals) setPayments([newPayRow("EFECTIVO", Math.round(totals.total * 0.5))]);
              }}
            />
            Cobrar seña ahora
          </label>
          {withDeposit &&
            (data.drawers.length === 0 ? (
              <p className="text-sm text-destructive">No hay ninguna caja diaria con turno abierto: abrí el turno para cobrar la seña (o cobrala después desde el pedido).</p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-r`}>Caja</Label>
                  <NativeSelect id={`${id}-r`} value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
                    {data.drawers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <CollectionPayments rows={payments} onChange={setPayments} methods={METHODS} due={deposit} />
                {totals && <p className="text-sm text-muted-foreground">Saldo a cobrar al entregar: {formatMoney(Math.max(0, totals.total - deposit))}</p>}
              </>
            ))}
        </CardContent>
      </Card>

      <StatusMessage status={status} />
      <Button className="w-fit" size="lg" disabled={pending || !clientId || lines.length === 0 || !totals || (hasDiscount && discountReason.trim().length < 3)} onClick={submit}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Registrar pedido
      </Button>
      {lines.length === 0 && (
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <Plus className="size-4" /> Agregá los productos del pedido.
        </p>
      )}
    </div>
  );
}
