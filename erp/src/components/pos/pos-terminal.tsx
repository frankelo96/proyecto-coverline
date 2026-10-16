"use client";

import { Loader2, Minus, PackagePlus, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";

import { type CatalogProduct, groupCatalog, priceRange, ProductPicker } from "@/components/pos/product-picker";
import { CollectionPayments, newPayRow, toCollectionPayload, type PayRow, payingClientOf } from "@/components/treasury/collection-payments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import type { ActionStatus } from "@/hooks/use-server-action";
import { formatMoney, formatNumber } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/masters/labels";
import { surchargeLabel, surchargeLinePrice } from "@/lib/pos/installments";
import { listFinalPrice } from "@/lib/pos/price-lists";
import { computeSaleTotals, planPayments, SaleError } from "@/lib/pos/sale-math";
import { UI_COLLECTION_METHODS } from "@/lib/validations/treasury";
import { createSaleAction } from "@/server/actions/treasury.actions";
import type { TerminalData } from "@/server/queries/treasury.queries";

interface CartLine {
  key: number;
  variantId: string | null;
  description: string;
  unitPrice: number;
  quantity: string;
  discountPct: string;
  stock: number | null;
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
let lineSeq = 1;

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type Done = { id: string; number: number; change: number; warnings: string[] };

export function PosTerminal({ data, canDiscount }: { data: TerminalData; canDiscount: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState("");
  const [invoiceType, setInvoiceType] = useState<"TICKET_INTERNO" | "FACTURA_B" | "FACTURA_A">("TICKET_INTERNO");
  const [globalDiscount, setGlobalDiscount] = useState("0");
  const [installments, setInstallments] = useState(1);
  const plan = data.installmentPlans.find((p) => p.installments === installments) ?? null;
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [delivery, setDelivery] = useState<"RETIRO_SUCURSAL" | "ENVIO">("RETIRO_SUCURSAL");
  const [address, setAddress] = useState("");
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [status, setStatus] = useState<ActionStatus>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();

  const client = data.clients.find((c) => c.id === clientId) ?? null;
  // Lista de precios: "" = la del cliente; "MINORISTA" = sin lista; o el id de otra lista (con permiso de descuento).
  const [listChoice, setListChoice] = useState("");
  const listIdFor = (c: typeof client, choice: string) => (choice === "" ? (c?.priceListId ?? null) : choice === "MINORISTA" ? null : choice);
  const listFor = (c: typeof client, choice: string) => data.priceLists.find((l) => l.id === listIdFor(c, choice)) ?? null;
  const priceList = listFor(client, listChoice);

  const catalog = useMemo(
    () => (priceList ? data.catalog.map((c) => ({ ...c, price: listFinalPrice(c.netPrice, c.vatRate, c.sizeAdjustmentPct, c.productId, priceList) })) : data.catalog),
    [data.catalog, priceList],
  );
  const products = useMemo(() => groupCatalog(catalog), [catalog]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rubro, setRubro] = useState<string>("");
  const openProduct = products.find((p) => p.productId === openId) ?? null;
  const rubros = [...new Set(products.map((p) => p.category))];

  /** Código de barras o SKU exacto de una variante (lector de códigos): se agrega directo. */
  const exactVariant = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (catalog.find((c) => c.barcode?.toLowerCase() === q || c.sku.toLowerCase() === q) ?? null) : null;
  }, [query, catalog]);

  const results = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return products
      .filter((p) =>
        tokens.every((t) =>
          normalize(`${p.name} ${p.sku} ${CATEGORY_LABELS[p.category]} ${p.variants.map((v) => `${v.color ?? ""} ${v.fabric ?? ""}`).join(" ")}`).includes(t),
        ),
      )
      .slice(0, 30);
  }, [query, products]);

  function choose(p: CatalogProduct) {
    // Un producto con una sola variante se agrega directo; si no, se elige color/tela/talle.
    if (p.variants.length === 1) {
      addVariant(p.variants[0].variantId);
      setOpenId(null);
    } else setOpenId(p.productId);
    setQuery("");
  }

  const inCart = (variantId: string) => num(cart.find((l) => l.variantId === variantId)?.quantity ?? "0");

  const hasDiscount = num(globalDiscount) > 0 || cart.some((l) => num(l.discountPct) > 0);

  const totals = useMemo(() => {
    if (cart.length === 0) return null;
    try {
      const lines = cart.map((l) => ({ quantity: num(l.quantity), unitPrice: l.unitPrice, discountPct: num(l.discountPct), vatRate: 21 }));
      const base = computeSaleTotals(lines, num(globalDiscount));
      // Mismo cálculo que el servidor: la línea de recargo por cuotas va sobre el total ya descontado.
      if (!plan || plan.surchargePct <= 0) return { ...base, surcharge: 0 };
      const price = surchargeLinePrice(base.total, plan.surchargePct, num(globalDiscount));
      const full = computeSaleTotals([...lines, { quantity: 1, unitPrice: price, discountPct: 0, vatRate: 21 }], num(globalDiscount));
      return { ...full, surcharge: Math.round((full.total - base.total) * 100) / 100 };
    } catch {
      return null;
    }
  }, [cart, globalDiscount, plan]);

  const paymentCheck = useMemo(() => {
    if (!totals || payments.length === 0) return null;
    try {
      planPayments(totals.total, toCollectionPayload(payments).map((p) => ({ method: p.method, amount: p.amount })));
      return null;
    } catch (e) {
      return e instanceof SaleError ? e.message : "Revisá los pagos";
    }
  }, [totals, payments]);

  function addVariant(variantId: string, quantity = 1) {
    const item = catalog.find((c) => c.variantId === variantId)!;
    setCart((c) => {
      const existing = c.find((l) => l.variantId === variantId);
      if (existing) return c.map((l) => (l === existing ? { ...l, quantity: String(num(l.quantity) + quantity) } : l));
      return [...c, { key: lineSeq++, variantId, description: item.label, unitPrice: item.price, quantity: String(quantity), discountPct: "0", stock: item.stock }];
    });
    setDone(null);
  }

  function addFree() {
    const price = num(freePrice);
    if (freeDesc.trim().length < 3 || price <= 0) return;
    setCart((c) => [...c, { key: lineSeq++, variantId: null, description: freeDesc.trim(), unitPrice: price, quantity: "1", discountPct: "0", stock: null }]);
    setFreeDesc("");
    setFreePrice("");
  }

  /** Cambió el cliente o la lista: se recalculan los precios de las prendas ya cargadas. */
  function changePricing(nextClientId: string, nextChoice: string) {
    const nextClient = data.clients.find((c) => c.id === nextClientId) ?? null;
    const list = listFor(nextClient, nextChoice);
    setCart((c) =>
      c.map((l) => {
        const item = l.variantId ? data.catalog.find((x) => x.variantId === l.variantId) : null;
        return item ? { ...l, unitPrice: listFinalPrice(item.netPrice, item.vatRate, item.sizeAdjustmentPct, item.productId, list) } : l;
      }),
    );
  }

  const updateLine = (key: number, patch: Partial<CartLine>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function quickPay(method: "EFECTIVO" | "MERCADO_PAGO" | "TRANSFERENCIA") {
    if (!totals) return;
    setPayments([newPayRow(method, totals.total)]);
  }

  function reset() {
    setCart([]);
    setPayments([]);
    setClientId("");
    setListChoice("");
    setInvoiceType("TICKET_INTERNO");
    setGlobalDiscount("0");
    setInstallments(1);
    setDiscountReason("");
    setDelivery("RETIRO_SUCURSAL");
    setAddress("");
    setQuery("");
    setOpenId(null);
  }

  function confirm() {
    setStatus(null);
    startTransition(async () => {
      const res = await createSaleAction({
        registerId: data.register.id,
        clientId: clientId || null,
        priceListId: listChoice || null,
        invoiceType,
        items: cart.map((l) => ({ variantId: l.variantId, description: l.variantId ? null : l.description, quantity: num(l.quantity), unitPrice: l.unitPrice, discountPct: num(l.discountPct) })),
        globalDiscountPct: num(globalDiscount),
        installments: installments > 1 ? installments : null,
        discountReason: hasDiscount ? discountReason.trim() || null : null,
        payments: toCollectionPayload(payments),
        deliveryMethod: delivery,
        shippingAddress: delivery === "ENVIO" ? address.trim() || null : null,
        notes: null,
      });
      if (res.ok) {
        setDone(res.data);
        setStatus({ kind: "success", text: res.message ?? "Venta registrada" });
        reset();
      } else {
        setStatus({ kind: "error", text: res.error });
      }
    });
  }

  const methods = UI_COLLECTION_METHODS.filter((m) => (m === "CUENTA_CORRIENTE" ? client && client.creditLimit > 0 : true));
  const canConfirm = totals && payments.length > 0 && !paymentCheck && !pending && (!hasDiscount || discountReason.trim().length >= 3) && cart.every((l) => num(l.quantity) > 0);

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* Catálogo y carrito ------------------------------------------------- */}
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            autoFocus
            placeholder="Buscar producto, color, tela, SKU o código de barras"
            aria-label="Buscar artículo"
            className="h-12 pl-11 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (exactVariant) {
                e.preventDefault();
                addVariant(exactVariant.variantId);
                setQuery("");
              } else if (results.length > 0) {
                e.preventDefault();
                choose(results[0]);
              }
            }}
          />
        </div>
        {results.length > 0 && (
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border bg-card" aria-label="Resultados">
            {results.map((p) => (
              <li key={p.productId}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  {p.imageId && (
                    // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por la API con caché
                    <img src={`/api/productos/imagenes/${p.imageId}?w=96`} alt="" loading="lazy" className="size-10 shrink-0 rounded object-cover" />
                  )}
                  <span className="flex-1">
                    {p.name}
                    <span className="block text-xs text-muted-foreground">
                      {CATEGORY_LABELS[p.category]} · {p.variants.length} {p.variants.length === 1 ? "variante" : "variantes"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="font-mono font-semibold tabular-nums">{priceRange(p)}</span>
                    <span className={p.stock > 0 ? "block text-xs text-muted-foreground" : "block text-xs font-medium text-destructive"}>stock {formatNumber(p.stock)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() && results.length === 0 && !exactVariant && <p className="text-sm text-muted-foreground">Sin resultados para “{query}”.</p>}
        {exactVariant && (
          <p className="text-sm text-muted-foreground">
            Código de {exactVariant.label}: presioná Enter para agregarlo.
          </p>
        )}

        {openProduct && <ProductPicker key={openProduct.productId} product={openProduct} onAdd={addVariant} onClose={() => setOpenId(null)} inCart={inCart} />}

        {!query.trim() && !openProduct && (
          <section aria-label="Productos por rubro" className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rubro">
              {["", ...rubros].map((r) => (
                <button
                  key={r || "todos"}
                  type="button"
                  aria-pressed={rubro === r}
                  onClick={() => setRubro(r)}
                  className={
                    rubro === r
                      ? "h-9 rounded-md border border-primary bg-primary px-3 text-sm text-primary-foreground"
                      : "h-9 rounded-md border border-input bg-card px-3 text-sm hover:bg-muted"
                  }
                >
                  {r ? CATEGORY_LABELS[r as CatalogProduct["category"]] : "Todos los rubros"}
                </button>
              ))}
            </div>
            <div className="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2 overflow-y-auto">
              {products
                .filter((p) => !rubro || p.category === rubro)
                .map((p) => (
                  <button
                    key={p.productId}
                    type="button"
                    onClick={() => choose(p)}
                    className="flex min-h-20 flex-col justify-between gap-1 rounded-md border bg-card p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {p.imageId && (
                      // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por la API con caché
                      <img src={`/api/productos/imagenes/${p.imageId}?w=320`} alt="" loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
                    )}
                    <span className="leading-snug font-medium">{p.name}</span>
                    <span className="flex items-end justify-between gap-2 text-xs text-muted-foreground">
                      <span>{p.variants.length} var.</span>
                      <span className="font-mono font-semibold text-foreground">{priceRange(p)}</span>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart aria-hidden="true" className="size-4" /> Venta
            </CardTitle>
            {cart.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Vaciar
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cart.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Elegí un producto por rubro o buscalo arriba; después tocá color, tela y talle.</p>}
            {cart.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b pb-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{l.description}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatMoney(l.unitPrice)} c/u
                    {l.stock !== null && num(l.quantity) > l.stock && <span className="ml-2 text-destructive">supera el stock ({formatNumber(l.stock)})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" aria-label={`Restar ${l.description}`} onClick={() => updateLine(l.key, { quantity: String(Math.max(1, num(l.quantity) - 1)) })}>
                    <Minus />
                  </Button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    aria-label={`Cantidad de ${l.description}`}
                    className="w-20 text-center"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                  <Button type="button" variant="outline" size="icon" aria-label={`Sumar ${l.description}`} onClick={() => updateLine(l.key, { quantity: String(num(l.quantity) + 1) })}>
                    <Plus />
                  </Button>
                </div>
                {canDiscount ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      aria-label={`Descuento % de ${l.description}`}
                      className="w-16 text-right"
                      value={l.discountPct}
                      onChange={(e) => updateLine(l.key, { discountPct: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                ) : (
                  <span />
                )}
                <span className="text-right font-mono font-semibold tabular-nums">{totals ? formatMoney(totals.lines[i]?.total ?? 0) : "—"}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${l.description}`} onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <details className="rounded-md border">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm">
                <PackagePlus aria-hidden="true" className="size-4" /> Ítem libre (medida especial, arreglo, bordado suelto)
              </summary>
              <div className="grid gap-2 border-t p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                <Input aria-label="Descripción del ítem libre" placeholder="Descripción" maxLength={200} value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} />
                <Input aria-label="Precio final" placeholder="Precio final" type="number" inputMode="decimal" min={0} value={freePrice} onChange={(e) => setFreePrice(e.target.value)} />
                <Button type="button" variant="outline" onClick={addFree}>
                  Agregar
                </Button>
              </div>
            </details>
          </CardContent>
        </Card>

        {data.session?.recentSales.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Últimas ventas del turno</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y text-sm">
                {data.session.recentSales.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <Link href={`/ventas/${s.id}`} className="font-mono underline-offset-4 hover:underline">
                        #{s.number}
                      </Link>{" "}
                      · {new Date(s.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      {s.client && <span className="text-muted-foreground"> · {s.client}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono tabular-nums">{formatMoney(s.total)}</span>
                      <Link href={`/pos/tickets/${s.id}`} target="_blank" aria-label={`Reimprimir ticket ${s.number}`} className="flex size-10 items-center justify-center rounded-md hover:bg-muted">
                        <Printer aria-hidden="true" className="size-4" />
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Cobro ---------------------------------------------------------------- */}
      <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-client`}>Cliente</Label>
              <NativeSelect
                id={`${id}-client`}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  const c = data.clients.find((x) => x.id === e.target.value);
                  // Comprobante sugerido por la condición frente al IVA: RI con CUIT → A; el resto, B (o ticket si venía en ticket).
                  if (c?.canInvoiceA) setInvoiceType("FACTURA_A");
                  else if (invoiceType === "FACTURA_A") setInvoiceType("FACTURA_B");
                  setListChoice("");
                  changePricing(e.target.value, "");
                }}
              >
                <option value="">Consumidor final</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              {client && (
                <p className="text-xs text-muted-foreground">
                  {client.document ?? "Sin documento"} · saldo cta. cte. {formatMoney(client.balance)}
                  {client.creditLimit > 0 && ` · disponible ${formatMoney(Math.max(0, client.creditLimit - client.balance))}`}
                </p>
              )}
            </div>
            {data.priceLists.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-list`}>Lista de precios</Label>
                <NativeSelect
                  id={`${id}-list`}
                  value={listChoice}
                  disabled={!canDiscount}
                  onChange={(e) => {
                    setListChoice(e.target.value);
                    changePricing(clientId, e.target.value);
                  }}
                >
                  <option value="">{client?.priceListId ? `Del cliente: ${data.priceLists.find((l) => l.id === client.priceListId)?.name ?? "—"}` : "Minorista (precio de lista)"}</option>
                  {client?.priceListId && <option value="MINORISTA">Minorista (precio de lista)</option>}
                  {data.priceLists
                    .filter((l) => l.id !== client?.priceListId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </NativeSelect>
                {!canDiscount && <p className="text-xs text-muted-foreground">Se aplica la lista del cliente. Para usar otra hace falta permiso de descuento.</p>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-inv`}>Comprobante</Label>
              <NativeSelect id={`${id}-inv`} value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}>
                <option value="TICKET_INTERNO">Ticket</option>
                <option value="FACTURA_B">Factura B</option>
                <option value="FACTURA_A" disabled={!client?.canInvoiceA}>
                  Factura A{client?.canInvoiceA ? "" : " (cliente RI con CUIT)"}
                </option>
              </NativeSelect>
            </div>
            {canDiscount && (
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-gd`}>Desc. %</Label>
                  <Input id={`${id}-gd`} type="number" inputMode="decimal" min={0} max={100} className="text-right" value={globalDiscount} onChange={(e) => setGlobalDiscount(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-dr`}>Motivo del descuento{hasDiscount && " *"}</Label>
                  <Input id={`${id}-dr`} maxLength={200} aria-invalid={hasDiscount && discountReason.trim().length < 3 ? true : undefined} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <section aria-label="Total" className="flex flex-col gap-2 rounded-lg bg-ink p-5 text-ink-foreground">
          {totals && totals.discountTotal > 0 && (
            <div className="flex justify-between text-sm text-ink-muted">
              <span>Descuentos</span>
              <span className="font-mono">-{formatMoney(totals.discountTotal)}</span>
            </div>
          )}
          {totals && totals.surcharge > 0 && (
            <div className="flex justify-between text-sm text-ink-muted">
              <span>Recargo por {installments} cuotas</span>
              <span className="font-mono">+{formatMoney(totals.surcharge)}</span>
            </div>
          )}
          {totals && invoiceType === "FACTURA_A" && (
            <>
              <div className="flex justify-between text-sm text-ink-muted">
                <span>Neto</span>
                <span className="font-mono">{formatMoney(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-ink-muted">
                <span>IVA</span>
                <span className="font-mono">{formatMoney(totals.taxTotal)}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Total</span>
            <output className="font-mono text-4xl font-semibold tabular-nums text-accent" aria-live="polite">
              {formatMoney(totals?.total ?? 0)}
            </output>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Cobro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.installmentPlans.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-cuotas`}>Cuotas (tarjeta / Mercado Pago)</Label>
                <NativeSelect
                  id={`${id}-cuotas`}
                  value={installments}
                  onChange={(e) => {
                    setInstallments(Number(e.target.value));
                    setPayments([]);
                  }}
                >
                  <option value={1}>1 pago (sin recargo)</option>
                  {data.installmentPlans.map((p) => (
                    <option key={p.installments} value={p.installments}>
                      {p.installments} cuotas{p.surchargePct > 0 ? ` (+${String(p.surchargePct).replace(".", ",")}%)` : " sin interés"}
                    </option>
                  ))}
                </NativeSelect>
                {plan && totals && totals.surcharge > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Se agrega «{surchargeLabel(plan)}» por {formatMoney(totals.surcharge)}: queda en el comprobante. Cuota aprox. {formatMoney(totals.total / plan.installments)}.
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cobro rápido por el total">
              <Button type="button" variant="outline" disabled={!totals} onClick={() => quickPay("EFECTIVO")}>
                Efectivo
              </Button>
              <Button type="button" variant="outline" disabled={!totals} onClick={() => quickPay("TRANSFERENCIA")}>
                Banco Macro
              </Button>
              <Button type="button" variant="outline" disabled={!totals} onClick={() => quickPay("MERCADO_PAGO")}>
                Mercado Pago
              </Button>
            </div>
            <CollectionPayments rows={payments} onChange={setPayments} methods={methods} due={totals?.total ?? 0} client={client ? payingClientOf(client.name, client.document) : null} />
            {paymentCheck && payments.length > 0 && !paymentCheck.startsWith("Faltan") && <p className="text-sm text-destructive">{paymentCheck}</p>}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-del`}>Entrega</Label>
              <NativeSelect id={`${id}-del`} value={delivery} onChange={(e) => setDelivery(e.target.value as typeof delivery)}>
                <option value="RETIRO_SUCURSAL">Se lo lleva / retira en el local</option>
                <option value="ENVIO">Envío</option>
              </NativeSelect>
              {delivery === "ENVIO" && <Input aria-label="Dirección de envío" placeholder="Dirección de envío" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />}
            </div>
          </CardContent>
        </Card>

        <StatusMessage status={status} />
        {done && (
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            {done.change > 0 && (
              <p className="text-lg font-semibold">
                Vuelto: <span className="font-mono text-accent-strong">{formatMoney(done.change)}</span>
              </p>
            )}
            {done.warnings.map((w) => (
              <Badge key={w} variant="accent" className="w-fit normal-case">
                {w}
              </Badge>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/pos/tickets/${done.id}?ancho=80`} target="_blank">
                  <Printer /> Ticket 80 mm
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/pos/tickets/${done.id}?ancho=58`} target="_blank">
                  <Printer /> Ticket 58 mm
                </Link>
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setDone(null);
                  setStatus(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <Plus /> Nueva venta
              </Button>
            </div>
          </div>
        )}
        <Button type="button" size="lg" className="h-14 text-base" disabled={!canConfirm} onClick={confirm}>
          {pending && <Loader2 className="animate-spin" />} Confirmar venta {totals && formatMoney(totals.total)}
        </Button>
      </aside>
    </div>
  );
}
