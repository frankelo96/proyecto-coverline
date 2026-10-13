"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ActionStatus } from "@/hooks/use-server-action";
import { computeQuoteTotals } from "@/lib/crm/quote-math";
import { formatMoney } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { saveQuoteAction } from "@/server/actions/crm.actions";
import type { QuoteFormData } from "@/server/queries/crm.queries";

export interface QuoteFormLine {
  productId: string | null;
  productText: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  vatRate: string;
}

export interface QuoteFormInitial {
  id: string | null;
  clientId: string | null;
  leadId: string | null;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  notes: string;
  items: QuoteFormLine[];
}

const VAT_RATES = ["21", "10.5", "27", "0"];
const n = (s: string) => parseLocaleNumber(s);
const decimalText = (v: number) => String(v).replace(".", ",");
const productLabel = (p: QuoteFormData["products"][number]) => `${p.sku} — ${p.name}`;
const clientLabel = (c: QuoteFormData["clients"][number]) => (c.document ? `${c.name} — ${c.document}` : c.name);

const emptyLine = (): QuoteFormLine => ({ productId: null, productText: "", description: "", quantity: "1", unitPrice: "0", discountPct: "0", vatRate: "21" });

export function QuoteForm({ data, initial }: { data: QuoteFormData; initial: QuoteFormInitial }) {
  const uid = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionStatus>(null);
  const [party, setParty] = useState<"cliente" | "oportunidad">(initial.leadId && !initial.clientId ? "oportunidad" : "cliente");
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientText, setClientText] = useState(() => {
    const c = data.clients.find((x) => x.id === initial.clientId);
    return c ? clientLabel(c) : "";
  });
  const [leadId, setLeadId] = useState(initial.leadId ?? "");
  const [header, setHeader] = useState({ validUntil: initial.validUntil, paymentTerms: initial.paymentTerms, deliveryTerms: initial.deliveryTerms, notes: initial.notes });
  const [lines, setLines] = useState<QuoteFormLine[]>(initial.items.length ? initial.items : [emptyLine()]);

  const productsByLabel = useMemo(() => new Map(data.products.map((p) => [productLabel(p), p])), [data.products]);
  const clientsByLabel = useMemo(() => new Map(data.clients.map((c) => [clientLabel(c), c])), [data.clients]);

  const updateLine = (i: number, patch: Partial<QuoteFormLine>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function onProductText(i: number, text: string) {
    const p = productsByLabel.get(text);
    if (p) {
      updateLine(i, {
        productText: text,
        productId: p.id,
        description: `${p.name}${p.sizes ? ` (talles ${p.sizes})` : ""}`,
        unitPrice: decimalText(p.listPrice),
        vatRate: String(p.vatRate),
      });
    } else updateLine(i, { productText: text, productId: null });
  }

  function onClientText(text: string) {
    setClientText(text);
    const c = clientsByLabel.get(text);
    setClientId(c?.id ?? null);
    // Condición de pago sugerida según el plazo del cliente (solo si no se escribió otra).
    if (c && (!header.paymentTerms || /^(Contado|Cuenta corriente a \d+ días)/.test(header.paymentTerms))) {
      setHeader((h) => ({ ...h, paymentTerms: c.paymentTermDays > 0 ? `Cuenta corriente a ${c.paymentTermDays} días` : "Contado contra entrega" }));
    }
  }

  const parsed = lines.map((l) => ({
    quantity: n(l.quantity),
    unitPrice: n(l.unitPrice),
    discountPct: n(l.discountPct || "0"),
    vatRate: Number(l.vatRate),
  }));
  const totals = (() => {
    try {
      if (parsed.some((p) => p.quantity === null || p.unitPrice === null || p.discountPct === null)) return null;
      return computeQuoteTotals(parsed as { quantity: number; unitPrice: number; discountPct: number; vatRate: number }[]);
    } catch {
      return null;
    }
  })();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const badLine = parsed.findIndex((p) => p.quantity === null || p.unitPrice === null || p.discountPct === null);
    if (badLine >= 0) {
      setStatus({ kind: "error", text: `Ítem ${badLine + 1}: revisá cantidad, precio y bonificación` });
      return;
    }
    if (party === "cliente" && !clientId) {
      setStatus({ kind: "error", text: clientText ? "Elegí el cliente de la lista (o crealo primero)" : "Elegí un cliente" });
      return;
    }
    const payload = {
      id: initial.id,
      clientId: party === "cliente" ? clientId : (data.leads.find((l) => l.id === leadId)?.clientId ?? null),
      leadId: party === "oportunidad" ? leadId || null : initial.leadId,
      validUntil: header.validUntil,
      paymentTerms: header.paymentTerms || null,
      deliveryTerms: header.deliveryTerms || null,
      notes: header.notes || null,
      items: lines.map((l, i) => ({
        productId: l.productId,
        description: l.description,
        quantity: parsed[i].quantity!,
        unitPrice: parsed[i].unitPrice!,
        discountPct: parsed[i].discountPct!,
        vatRate: parsed[i].vatRate,
      })),
    };
    startTransition(async () => {
      const r = await saveQuoteAction(payload);
      if (!r.ok) setStatus({ kind: "error", text: r.error });
      else router.push(`/crm/presupuestos/${r.data.id}?aviso=${encodeURIComponent(r.message ?? "Guardado")}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Para quién</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div role="radiogroup" aria-label="Destinatario" className="flex gap-1.5">
            {(["cliente", "oportunidad"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={party === p}
                onClick={() => setParty(p)}
                className={
                  party === p
                    ? "h-10 rounded-md border border-primary bg-primary px-3 text-sm text-primary-foreground"
                    : "h-10 rounded-md border border-input bg-card px-3 text-sm hover:bg-muted"
                }
              >
                {p === "cliente" ? "Cliente" : "Oportunidad (sin alta de cliente)"}
              </button>
            ))}
          </div>
          {party === "cliente" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-client`} className="sr-only">
                Cliente
              </Label>
              <Input
                id={`${uid}-client`}
                list={`${uid}-clients`}
                value={clientText}
                onChange={(e) => onClientText(e.target.value)}
                placeholder="Escribí para buscar por nombre o CUIT…"
                autoComplete="off"
                aria-invalid={!!clientText && !clientId}
              />
              <datalist id={`${uid}-clients`}>
                {data.clients.map((c) => (
                  <option key={c.id} value={clientLabel(c)} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                ¿No está?{" "}
                <Link href="/crm/clientes/nuevo" className="underline underline-offset-4" target="_blank">
                  Crear cliente
                </Link>{" "}
                (se abre en otra pestaña; después recargá esta).
              </p>
            </div>
          ) : (
            <NativeSelect aria-label="Oportunidad" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">Elegí una oportunidad…</option>
              {data.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0 py-0">
          <datalist id={`${uid}-products`}>
            {data.products.map((p) => (
              <option key={p.id} value={productLabel(p)} />
            ))}
          </datalist>
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-64 pl-5">Producto</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-24 text-right">Cantidad</TableHead>
                  <TableHead className="w-32 text-right">Precio unit. neto</TableHead>
                  <TableHead className="w-24 text-right">Bonif. %</TableHead>
                  <TableHead className="w-28">IVA</TableHead>
                  <TableHead className="w-32 text-right">Subtotal neto</TableHead>
                  <TableHead className="w-12 pr-5">
                    <span className="sr-only">Quitar</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-5 align-top">
                      <Input
                        aria-label={`Producto del ítem ${i + 1}`}
                        list={`${uid}-products`}
                        value={l.productText}
                        onChange={(e) => onProductText(i, e.target.value)}
                        placeholder="Buscar o dejar vacío"
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        aria-label={`Descripción del ítem ${i + 1}`}
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        rows={1}
                        className="min-h-9 py-1.5"
                        placeholder="Chomba piqué bordada con logo…"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input aria-label="Cantidad" inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="h-9 text-right" />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input aria-label="Precio unitario neto" inputMode="decimal" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} className="h-9 text-right" />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input aria-label="Bonificación %" inputMode="decimal" value={l.discountPct} onChange={(e) => updateLine(i, { discountPct: e.target.value })} className="h-9 text-right" />
                    </TableCell>
                    <TableCell className="align-top">
                      <NativeSelect aria-label="Alícuota de IVA" value={l.vatRate} onChange={(e) => updateLine(i, { vatRate: e.target.value })} className="h-9">
                        {VAT_RATES.map((r) => (
                          <option key={r} value={r}>
                            {r.replace(".", ",")}%
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="pt-4 text-right align-top font-mono tabular-nums">{totals ? formatMoney(totals.lines[i].net) : "—"}</TableCell>
                    <TableCell className="pr-5 align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar ítem ${i + 1}`}
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-5">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus /> Agregar ítem
            </Button>
            <dl className="grid min-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              {totals && totals.discountTotal > 0 && (
                <>
                  <dt className="text-muted-foreground">Bonificaciones</dt>
                  <dd className="text-right font-mono tabular-nums">−{formatMoney(totals.discountTotal)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Subtotal neto</dt>
              <dd className="text-right font-mono tabular-nums">{totals ? formatMoney(totals.subtotal) : "—"}</dd>
              {totals?.vatByRate.map((v) => (
                <div key={v.rate} className="contents">
                  <dt className="text-muted-foreground">IVA {String(v.rate).replace(".", ",")}%</dt>
                  <dd className="text-right font-mono tabular-nums">{formatMoney(v.vat)}</dd>
                </div>
              ))}
              <dt className="border-t pt-1 font-semibold">Total</dt>
              <dd className="border-t pt-1 text-right font-mono text-base font-semibold tabular-nums">{totals ? formatMoney(totals.total) : "—"}</dd>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-valid`}>Válido hasta</Label>
            <Input id={`${uid}-valid`} type="date" value={header.validUntil} onChange={(e) => setHeader((h) => ({ ...h, validUntil: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-pay`}>Forma de pago</Label>
            <Input id={`${uid}-pay`} value={header.paymentTerms} onChange={(e) => setHeader((h) => ({ ...h, paymentTerms: e.target.value }))} placeholder="50% anticipo, saldo contra entrega" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-delivery`}>Plazo de entrega</Label>
            <Input id={`${uid}-delivery`} value={header.deliveryTerms} onChange={(e) => setHeader((h) => ({ ...h, deliveryTerms: e.target.value }))} placeholder="20 días hábiles desde la aprobación" />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-3">
            <Label htmlFor={`${uid}-notes`}>Observaciones (se imprimen)</Label>
            <Textarea id={`${uid}-notes`} value={header.notes} onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))} rows={3} placeholder="Incluye bordado de logo en pecho izquierdo. Precios sujetos a variación de costos de tela." />
          </div>
        </CardContent>
      </Card>

      <StatusMessage status={status} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={initial.id ? `/crm/presupuestos/${initial.id}` : "/crm/presupuestos"}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {initial.id ? "Guardar cambios" : "Crear presupuesto"}
        </Button>
      </div>
    </form>
  );
}
