"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import type { ActionStatus } from "@/hooks/use-server-action";
import { formatMoney, formatNumber, formatPct, UOM_SHORT } from "@/lib/format";
import { suggestedInvoiceType, todayIso } from "@/lib/purchasing/labels";
import { computePurchaseTotals, convertToStockUnit, costChange, discriminatesVat, PurchasingError } from "@/lib/purchasing/math";
import { headerRefine, invoiceHeaderShape, merchandiseItemSchema } from "@/lib/validations/purchasing";
import { createMerchandisePurchaseAction } from "@/server/actions/purchasing.actions";
import type { MerchandiseFormData } from "@/server/queries/purchasing.queries";
import type { MerchandiseResult } from "@/server/services/purchasing.service";

import { InvoiceHeaderFields, numOrZero } from "./invoice-header-fields";
import { TotalsBox } from "./totals-box";

/** Grupo visible en el formulario: separa materia prima, avíos y producto terminado. */
const GROUPS = {
  TELA: { label: "Materia prima (telas)", kind: "RAW" },
  AVIO: { label: "Avíos, insumos y empaque", kind: "RAW" },
  PRODUCTO: { label: "Producto terminado", kind: "VARIANT" },
} as const;
type Group = keyof typeof GROUPS;

const formSchema = z
  .object({
    supplierId: z.string().min(1, "Elegí el proveedor"),
    items: z.array(z.intersection(merchandiseItemSchema, z.object({ group: z.enum(["TELA", "AVIO", "PRODUCTO"]) }))).min(1, "Cargá al menos un ítem"),
    ...invoiceHeaderShape,
  })
  .superRefine(headerRefine);
type FormValues = z.infer<typeof formSchema>;
type Item = FormValues["items"][number];

/** Variación de costo (en %) a partir de la cual se advierte un posible error de carga. */
const UNUSUAL_CHANGE_PCT = 30;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function MerchandisePurchaseForm({ data }: { data: MerchandiseFormData }) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionStatus>(null);
  const [result, setResult] = useState<MerchandiseResult | null>(null);
  const materials = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const variants = useMemo(() => new Map(data.variants.map((v) => [v.id, v])), [data.variants]);

  const emptyValues: FormValues = {
    supplierId: "",
    items: [],
    invoiceType: "FACTURA_A",
    pointOfSale: null,
    invoiceNumber: null,
    remitNumber: null,
    date: todayIso(),
    dueDate: null,
    perceptionIva: 0,
    perceptionIibb: 0,
    otherTaxes: 0,
    notes: null,
  };
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: emptyValues });
  const { control, register, setValue, handleSubmit, reset, formState } = form;
  const items = useFieldArray({ control, name: "items" });
  const values = useWatch({ control }) as FormValues;
  const supplier = data.suppliers.find((s) => s.id === values.supplierId);
  const withVat = discriminatesVat(values.invoiceType);

  const totals = useMemo(() => {
    try {
      return computePurchaseTotals(
        (values.items ?? []).map((i) => ({ quantity: n(i.quantity), unitCost: n(i.unitCost), vatRate: n(i.vatRate) })),
        { perceptionIva: n(values.perceptionIva), perceptionIibb: n(values.perceptionIibb), otherTaxes: n(values.otherTaxes) },
        values.invoiceType,
      );
    } catch {
      return null;
    }
  }, [values]);

  function addItem(group: Group) {
    items.append({
      group,
      kind: GROUPS[group].kind,
      rawMaterialId: null,
      productVariantId: null,
      quantity: 1,
      uom: group === "PRODUCTO" ? "UNIDAD" : group === "TELA" ? "METRO" : "UNIDAD",
      unitCost: 0,
      vatRate: 21,
      updateCost: true,
    } as Item);
  }

  function pickArticle(index: number, articleId: string) {
    const item = values.items[index];
    if (item.group === "PRODUCTO") {
      const v = variants.get(articleId);
      setValue(`items.${index}.productVariantId`, articleId || null);
      setValue(`items.${index}.unitCost`, v?.currentCost ?? 0);
      setValue(`items.${index}.updateCost`, v?.sourcing === "REVENTA");
    } else {
      const m = materials.get(articleId);
      setValue(`items.${index}.rawMaterialId`, articleId || null);
      setValue(`items.${index}.uom`, m?.uom ?? "UNIDAD");
      setValue(`items.${index}.unitCost`, m?.currentCost ?? 0);
    }
  }

  function onSupplier(supplierId: string) {
    const s = data.suppliers.find((x) => x.id === supplierId);
    if (s) setValue("invoiceType", suggestedInvoiceType(s.taxCondition));
  }

  /** Impacto de la línea en el costo de reposición. */
  function impact(item: Item) {
    if (item.group === "PRODUCTO") {
      const v = item.productVariantId ? variants.get(item.productVariantId) : undefined;
      if (!v) return null;
      const c = costChange(v.currentCost, n(item.unitCost));
      return { stockQty: n(item.quantity), stockUom: "UNIDAD" as const, stockCost: n(item.unitCost), previous: v.currentCost, ...c, used: 0, appliesCost: v.sourcing === "REVENTA" };
    }
    const m = item.rawMaterialId ? materials.get(item.rawMaterialId) : undefined;
    if (!m) return null;
    try {
      const conv = convertToStockUnit({ purchasedUom: item.uom, stockUom: m.uom, metersPerKg: m.metersPerKg, quantity: n(item.quantity), unitCost: n(item.unitCost) });
      const c = costChange(m.currentCost, conv.stockUnitCost);
      return { stockQty: conv.stockQuantity, stockUom: m.uom, stockCost: conv.stockUnitCost, previous: m.currentCost, ...c, used: m.usedInProducts, appliesCost: true };
    } catch (e) {
      return { error: e instanceof PurchasingError ? e.message : "No se pudo convertir" };
    }
  }

  const onSubmit = handleSubmit(
    (v) => {
      setStatus(null);
      setResult(null);
      startTransition(async () => {
        const res = await createMerchandisePurchaseAction({
          ...v,
          items: v.items.map((i) => ({
            kind: i.kind,
            rawMaterialId: i.rawMaterialId,
            productVariantId: i.productVariantId,
            quantity: i.quantity,
            uom: i.uom,
            unitCost: i.unitCost,
            vatRate: withVat ? i.vatRate : 0,
            updateCost: i.updateCost,
          })),
        });
        if (res.ok) {
          setResult(res.data);
          setStatus({ kind: "success", text: res.message ?? "Compra registrada" });
          reset({ ...emptyValues, supplierId: v.supplierId, invoiceType: v.invoiceType, date: v.date });
        } else {
          setStatus({ kind: "error", text: res.error });
        }
      });
    },
    (errors) => {
      const first = errors.supplierId?.message ?? errors.invoiceNumber?.message ?? errors.items?.message ?? errors.items?.root?.message;
      setStatus({ kind: "error", text: first ?? "Revisá los campos marcados en los ítems" });
    },
  );

  const groupsInUse = (Object.keys(GROUPS) as Group[]).map((g) => ({
    group: g,
    rows: items.fields.map((f, i) => ({ f, i })).filter(({ i }) => values.items?.[i]?.group === g),
  }));

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Proveedor y comprobante</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor={`${id}-sup`}>Proveedor</Label>
            <NativeSelect
              id={`${id}-sup`}
              aria-invalid={formState.errors.supplierId ? true : undefined}
              {...register("supplierId", { onChange: (e) => onSupplier(e.target.value) })}
            >
              <option value="">Elegí el proveedor…</option>
              {data.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <InvoiceHeaderFields form={form} dueHint={supplier ? `Si lo dejás vacío: fecha + ${supplier.paymentTermDays} días` : "Según plazo del proveedor"} />
        </CardContent>
      </Card>

      {groupsInUse.map(({ group, rows }) => (
        <Card key={group}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <CardTitle>{GROUPS[group].label}</CardTitle>
              <CardDescription>
                {group === "TELA" && "Podés cargar por metro o por kg: se convierte a la unidad de stock con el rendimiento de la tela."}
                {group === "AVIO" && "Botones, cierres, elásticos, abrojos, hilos, etiquetas y empaque."}
                {group === "PRODUCTO" && "Prendas o accesorios comprados terminados. Si son de reventa, actualizan su costo."}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => addItem(group)}>
              <Plus /> Agregar
            </Button>
          </CardHeader>
          {rows.length > 0 && (
            <CardContent className="flex flex-col divide-y p-0">
              {rows.map(({ f, i }) => {
                const item = values.items[i];
                const imp = impact(item);
                const mat = item.rawMaterialId ? materials.get(item.rawMaterialId) : undefined;
                const options =
                  group === "PRODUCTO"
                    ? data.variants.map((v) => ({ id: v.id, label: `${v.label}${v.sourcing === "REVENTA" ? " · reventa" : ""}` }))
                    : data.materials
                        .filter((m) => (group === "TELA" ? m.type === "TELA" : m.type !== "TELA"))
                        .map((m) => ({ id: m.id, label: `${m.code} · ${m.name} (${formatMoney(m.currentCost)}/${UOM_SHORT[m.uom]})` }));
                return (
                  <div key={f.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto] md:items-end">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${id}-a-${i}`}>Artículo</Label>
                      <NativeSelect
                        id={`${id}-a-${i}`}
                        value={(group === "PRODUCTO" ? item.productVariantId : item.rawMaterialId) ?? ""}
                        onChange={(e) => pickArticle(i, e.target.value)}
                      >
                        <option value="">Elegí…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${id}-q-${i}`}>Cantidad</Label>
                      <Input id={`${id}-q-${i}`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" {...register(`items.${i}.quantity`, { setValueAs: numOrZero })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${id}-u-${i}`}>Unidad</Label>
                      <NativeSelect id={`${id}-u-${i}`} {...register(`items.${i}.uom`)}>
                        {(group === "PRODUCTO" || !mat ? [item.uom] : mat.uoms).map((u) => (
                          <option key={u} value={u}>
                            {UOM_SHORT[u]}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${id}-p-${i}`}>{withVat ? "Precio unit. neto" : "Precio unit. final"}</Label>
                      <Input id={`${id}-p-${i}`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" {...register(`items.${i}.unitCost`, { setValueAs: numOrZero })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${id}-v-${i}`}>IVA</Label>
                      {withVat ? (
                        <NativeSelect id={`${id}-v-${i}`} {...register(`items.${i}.vatRate`, { setValueAs: (v) => Number(v) })}>
                          <option value={21}>21%</option>
                          <option value={10.5}>10,5%</option>
                          <option value={27}>27%</option>
                          <option value={0}>Exento</option>
                        </NativeSelect>
                      ) : (
                        <p id={`${id}-v-${i}`} className="flex h-10 items-center text-sm text-muted-foreground">
                          Incluido
                        </p>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label="Quitar ítem" onClick={() => items.remove(i)}>
                      <Trash2 />
                    </Button>

                    {imp && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs md:col-span-6">
                        {"error" in imp ? (
                          <span className="text-destructive">{imp.error}</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              Ingresa a stock: <span className="font-mono text-foreground">{formatNumber(imp.stockQty)} {UOM_SHORT[imp.stockUom]}</span> a{" "}
                              <span className="font-mono text-foreground">{formatMoney(imp.stockCost)}/{UOM_SHORT[imp.stockUom]}</span>
                            </span>
                            {imp.appliesCost && imp.delta !== 0 && (
                              <Badge variant={imp.increased ? "accent" : "success"}>
                                {imp.increased ? <TrendingUp aria-hidden="true" className="size-3" /> : <TrendingDown aria-hidden="true" className="size-3" />}
                                {imp.deltaPct === null ? "nuevo costo" : `${imp.increased ? "+" : ""}${formatPct(imp.deltaPct)}`} vs. reposición {formatMoney(imp.previous)}
                              </Badge>
                            )}
                            {imp.appliesCost && imp.deltaPct !== null && Math.abs(imp.deltaPct) >= UNUSUAL_CHANGE_PCT && (
                              <span role="alert" className="flex items-center gap-1 font-semibold text-destructive">
                                <AlertTriangle aria-hidden="true" className="size-3.5" /> Variación inusual: revisá artículo, unidad y precio
                              </span>
                            )}
                            {imp.appliesCost && imp.increased && imp.used > 0 && item.updateCost && (
                              <span className="font-medium text-accent-strong">Recalcula {imp.used} ficha{imp.used === 1 ? "" : "s"} técnica{imp.used === 1 ? "" : "s"}</span>
                            )}
                            {imp.appliesCost && imp.delta !== 0 && (
                              <label className="flex min-h-9 items-center gap-2">
                                <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register(`items.${i}.updateCost`)} />
                                Actualizar costo de reposición
                              </label>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      ))}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-2">
          <Label htmlFor={`${id}-notes`}>Observaciones</Label>
          <textarea
            id={`${id}-notes`}
            rows={3}
            maxLength={500}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            {...register("notes", { setValueAs: (v) => (v === "" ? null : v) })}
          />
        </div>
        <Card className="min-w-0 flex-[1_1_320px]">
          <CardContent>{totals ? <TotalsBox totals={totals} /> : <p className="text-sm text-destructive">Revisá cantidades y precios</p>}</CardContent>
        </Card>
      </div>

      <StatusMessage status={status} />
      {result && <PurchaseResultPanel result={result} />}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || items.fields.length === 0}>
          {pending && <Loader2 className="animate-spin" />} Registrar compra
        </Button>
        <Button asChild variant="outline">
          <Link href="/compras">Volver</Link>
        </Button>
      </div>
    </form>
  );
}

function PurchaseResultPanel({ result }: { result: MerchandiseResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Impacto en costos</CardTitle>
        <CardDescription>
          <Link href={`/compras/${result.id}`} className="underline underline-offset-4">
            Ver compra #{result.number}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {result.costAlerts.length === 0 && result.affectedProducts.length === 0 && <p className="text-muted-foreground">Sin cambios en costos de reposición.</p>}
        {result.costAlerts.length > 0 && (
          <div role="alert" className="flex gap-3 rounded-md border border-accent bg-accent/10 p-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
            <ul className="flex flex-col gap-1">
              {result.costAlerts.map((a) => (
                <li key={a.code}>
                  <strong>{a.name}</strong> subió de {formatMoney(a.previous)} a {formatMoney(a.next)}
                  {a.deltaPct !== null && ` (+${formatPct(a.deltaPct)})`}: supera el costo con el que están calculadas las fichas.
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.affectedProducts.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border">
            {result.affectedProducts.map((p) => (
              <li key={p.sku} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{p.sku}</span> {p.name}
                </span>
                <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
                  {formatMoney(p.previousCost)} → {formatMoney(p.newCost)}
                  {p.marginAlert && <Badge variant="destructive">Revisar precio de lista</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
