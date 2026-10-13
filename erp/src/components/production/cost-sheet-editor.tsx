"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RawMaterialType, ServiceType } from "@/generated/prisma/enums";
import {
  applyMaterialPriceShock,
  computeCostSheet,
  CostingError,
  type CostBreakdown,
} from "@/lib/costing/escandallo";
import { formatMoney, formatNumber, MATERIAL_TYPE_LABELS, SERVICE_TYPE_LABELS, UOM_SHORT } from "@/lib/format";
import { costSheetFormSchema, type CostSheetFormValues } from "@/lib/validations/cost-sheet";
import { saveCostSheetAction } from "@/server/actions/costing.actions";
import type { CostSheetEditorData } from "@/server/queries/production.queries";

import { CostSummaryPanel } from "./cost-summary-panel";

const ROUNDING_OPTIONS = [0, 10, 50, 100, 500, 1000];
const MATERIAL_TYPE_ORDER: RawMaterialType[] = ["TELA", "AVIO", "INSUMO", "EMPAQUE"];
const SERVICE_TYPE_ORDER: ServiceType[] = [
  "CORTE",
  "CONFECCION",
  "BORDADO",
  "ESTAMPADO",
  "SUBLIMACION",
  "PLANCHADO",
  "EMPAQUE",
  "FLETE",
  "OTRO",
];

/** Los inputs numéricos vacíos llegan como NaN: para la vista previa valen 0. */
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function firstErrorMessage(errors: FieldErrors<CostSheetFormValues>): string | null {
  const walk = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const rec = node as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message) return rec.message;
    for (const key of Object.keys(rec)) {
      if (key === "ref") continue;
      const found = walk(rec[key]);
      if (found) return found;
    }
    return null;
  };
  return walk(errors);
}

type Status = { kind: "success" | "error"; text: string } | null;

export function CostSheetEditor({ data, canEdit }: { data: CostSheetEditorData; canEdit: boolean }) {
  const router = useRouter();
  const formId = useId();
  const [isSaving, startSaving] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  const [applySuggestedPrice, setApplySuggestedPrice] = useState(false);

  const materialCatalog = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const serviceCatalog = useMemo(() => new Map(data.services.map((s) => [s.id, s])), [data.services]);

  const form = useForm<CostSheetFormValues>({
    resolver: zodResolver(costSheetFormSchema),
    defaultValues: data.initialValues,
    mode: "onChange",
  });
  const { control, register, setValue, handleSubmit, reset, formState } = form;
  const materials = useFieldArray({ control, name: "materials" });
  const services = useFieldArray({ control, name: "services" });
  const values = useWatch({ control }) as CostSheetFormValues;

  // --- Recalculo en tiempo real -------------------------------------------
  const preview = useMemo((): { breakdown: CostBreakdown | null; error: string | null } => {
    try {
      const materialLines = (values.materials ?? []).map((m) => ({
        rawMaterialId: m.rawMaterialId,
        code: m.code,
        name: m.name || "Sin seleccionar",
        type: m.type,
        uom: m.uom,
        quantity: n(m.quantity),
        wastePct: n(m.wastePct),
        unitCost: n(m.unitCost),
      }));
      const shocked = applyMaterialPriceShock(materialLines, n(values.fabricShockPct), (l) => l.type === "TELA");
      const breakdown = computeCostSheet({
        materials: shocked,
        services: (values.services ?? []).map((s) => ({
          serviceCostId: s.serviceCostId,
          name: s.name || "Sin seleccionar",
          type: s.type,
          unitLabel: s.unitLabel,
          quantity: n(s.quantity),
          unitCost: n(s.unitCost),
        })),
        overheadPct: n(values.overheadPct),
        pricingMode: values.pricingMode,
        pricingPct: n(values.pricingPct),
        vatRate: n(values.vatRate),
        priceRoundingStep: n(values.priceRoundingStep),
        listPrice: data.product.listPrice,
        baselineCost: data.product.currentCost,
      });
      return { breakdown, error: null };
    } catch (e) {
      return { breakdown: null, error: e instanceof CostingError ? e.message : "No se pudo calcular el escandallo" };
    }
  }, [values, data.product.listPrice, data.product.currentCost]);

  const simulated = useMemo(() => {
    const overrides = (values.materials ?? []).some((m) => {
      const cat = materialCatalog.get(m.rawMaterialId);
      return cat !== undefined && n(m.unitCost) !== cat.currentCost;
    });
    const serviceOverrides = (values.services ?? []).some((s) => {
      const cat = serviceCatalog.get(s.serviceCostId);
      return cat !== undefined && n(s.unitCost) !== cat.unitCost;
    });
    return overrides || serviceOverrides || n(values.fabricShockPct) !== 0;
  }, [values, materialCatalog, serviceCatalog]);

  // --- Selección desde catálogo -------------------------------------------
  function fillMaterial(index: number, id: string) {
    const m = materialCatalog.get(id);
    if (!m) return;
    setValue(`materials.${index}.code`, m.code);
    setValue(`materials.${index}.name`, m.name);
    setValue(`materials.${index}.type`, m.type);
    setValue(`materials.${index}.uom`, m.uom);
    setValue(`materials.${index}.unitCost`, m.currentCost, { shouldValidate: true });
  }

  function fillService(index: number, id: string) {
    const s = serviceCatalog.get(id);
    if (!s) return;
    setValue(`services.${index}.name`, s.name);
    setValue(`services.${index}.type`, s.type);
    setValue(`services.${index}.unitLabel`, s.unitLabel);
    setValue(`services.${index}.unitCost`, s.unitCost, { shouldValidate: true });
  }

  function addMaterial() {
    materials.append({
      rawMaterialId: "",
      code: null,
      name: "",
      type: "TELA",
      uom: "METRO",
      quantity: 1,
      wastePct: 0,
      unitCost: 0,
      notes: null,
    });
  }

  function addService() {
    services.append({
      serviceCostId: "",
      name: "",
      type: "CONFECCION",
      unitLabel: null,
      quantity: 1,
      unitCost: 0,
      notes: null,
    });
  }

  /** Vuelve los costos unitarios a los precios de reposición vigentes. */
  function resetToCatalogPrices(current: CostSheetFormValues): CostSheetFormValues {
    return {
      ...current,
      fabricShockPct: 0,
      materials: current.materials.map((m) => ({ ...m, unitCost: materialCatalog.get(m.rawMaterialId)?.currentCost ?? m.unitCost })),
      services: current.services.map((s) => ({ ...s, unitCost: serviceCatalog.get(s.serviceCostId)?.unitCost ?? s.unitCost })),
    };
  }

  // --- Guardado ------------------------------------------------------------
  const onSubmit = handleSubmit(
    (formValues) => {
      setStatus(null);
      startSaving(async () => {
        const result = await saveCostSheetAction({
          productId: data.product.id,
          materials: formValues.materials.map((m) => ({
            rawMaterialId: m.rawMaterialId,
            quantity: m.quantity,
            wastePct: m.wastePct,
            notes: m.notes,
          })),
          services: formValues.services.map((s) => ({
            serviceCostId: s.serviceCostId,
            quantity: s.quantity,
            notes: s.notes,
          })),
          overheadPct: formValues.overheadPct,
          pricingMode: formValues.pricingMode,
          pricingPct: formValues.pricingPct,
          vatRate: formValues.vatRate,
          priceRoundingStep: formValues.priceRoundingStep,
          applySuggestedPrice,
        });
        if (result.ok) {
          reset(resetToCatalogPrices(formValues));
          setApplySuggestedPrice(false);
          setStatus({
            kind: "success",
            text: `${result.message ?? "Guardado"}. Costo vigente: ${formatMoney(result.data.newCost)}.`,
          });
          router.refresh();
        } else {
          setStatus({ kind: "error", text: result.error });
        }
      });
    },
    (errors) => setStatus({ kind: "error", text: firstErrorMessage(errors) ?? "Revisá los campos marcados" }),
  );

  const breakdown = preview.breakdown;
  const err = formState.errors;

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* Encabezado ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm text-muted-foreground">{data.product.sku}</p>
          <h1 className="text-3xl font-bold tracking-tight">Escandallo — {data.product.name}</h1>
          <p className="text-sm text-muted-foreground">
            Costos recalculados en vivo con los precios de reposición vigentes. Editá costos unitarios o la variación de telas para simular.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {simulated && <Badge variant="accent">Simulación activa</Badge>}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset(data.initialValues);
              setStatus(null);
            }}
            disabled={isSaving || !formState.isDirty}
          >
            <RotateCcw /> Restablecer
          </Button>
          {canEdit && (
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Save />} Guardar ficha
            </Button>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" className="empty:hidden">
        {status && (
          <p
            className={
              status.kind === "success"
                ? "rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm text-success"
                : "rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            }
          >
            {status.text}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {/* Columna principal -------------------------------------------------- */}
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Materiales (BOM)</CardTitle>
                <CardDescription>Telas, avíos y empaque por prenda. Consumo neto + merma de corte.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                <Plus /> Agregar material
              </Button>
            </CardHeader>
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[34%] pl-5">Materia prima</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                  <TableHead className="text-right">Merma %</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-12 pr-5">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.fields.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Sin materiales. Agregá la tela principal para empezar.
                    </TableCell>
                  </TableRow>
                )}
                {materials.fields.map((field, i) => {
                  const line = values.materials?.[i];
                  const result = breakdown?.materials[i];
                  const catalog = line ? materialCatalog.get(line.rawMaterialId) : undefined;
                  const overridden = catalog !== undefined && n(line?.unitCost) !== catalog.currentCost;
                  const lineErr = err.materials?.[i];
                  return (
                    <TableRow key={field.id}>
                      <TableCell className="pl-5">
                        <Label htmlFor={`${formId}-m-${i}`} className="sr-only">
                          Materia prima {i + 1}
                        </Label>
                        <NativeSelect
                          id={`${formId}-m-${i}`}
                          aria-invalid={lineErr?.rawMaterialId ? true : undefined}
                          {...register(`materials.${i}.rawMaterialId`, { onChange: (e) => fillMaterial(i, e.target.value) })}
                        >
                          <option value="">Elegí una materia prima…</option>
                          {MATERIAL_TYPE_ORDER.map((type) => {
                            const opts = data.materials.filter((m) => m.type === type);
                            if (opts.length === 0) return null;
                            return (
                              <optgroup key={type} label={MATERIAL_TYPE_LABELS[type]}>
                                {opts.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.code} · {m.name} ({formatMoney(m.currentCost)}/{UOM_SHORT[m.uom]})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </NativeSelect>
                        {line?.type && line.rawMaterialId && (
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{MATERIAL_TYPE_LABELS[line.type]}</Badge>
                            {result && (
                              <span>
                                Bruto {formatNumber(result.grossQuantity)} {UOM_SHORT[line.uom]}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.0001"
                            min={0}
                            aria-label={`Consumo de ${line?.name || `material ${i + 1}`}`}
                            aria-invalid={lineErr?.quantity ? true : undefined}
                            className="w-24 text-right"
                            {...register(`materials.${i}.quantity`, { valueAsNumber: true })}
                          />
                          <span className="w-8 text-xs text-muted-foreground">{line?.uom ? UOM_SHORT[line.uom] : ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min={0}
                          max={100}
                          aria-label={`Merma de ${line?.name || `material ${i + 1}`}`}
                          aria-invalid={lineErr?.wastePct ? true : undefined}
                          className="ml-auto w-20 text-right"
                          {...register(`materials.${i}.wastePct`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          aria-label={`Costo unitario de ${line?.name || `material ${i + 1}`}`}
                          aria-invalid={lineErr?.unitCost ? true : undefined}
                          className={overridden ? "ml-auto w-28 border-accent text-right" : "ml-auto w-28 text-right"}
                          {...register(`materials.${i}.unitCost`, { valueAsNumber: true })}
                        />
                        {overridden && catalog && (
                          <p className="mt-1 text-xs text-accent-strong">Vigente {formatMoney(catalog.currentCost)}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {result ? formatMoney(result.subtotal) : "—"}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar ${line?.name || `material ${i + 1}`}`}
                          onClick={() => materials.remove(i)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {breakdown && materials.fields.length > 0 && (
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="pl-5">
                      Total materiales
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(breakdown.materialsCost)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Procesos y talleres</CardTitle>
                <CardDescription>Corte, fasón de confección, personalización, planchado, empaque y fletes.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addService}>
                <Plus /> Agregar proceso
              </Button>
            </CardHeader>
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[42%] pl-5">Proceso / tarifa</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Tarifa</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-12 pr-5">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.fields.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Sin procesos cargados.
                    </TableCell>
                  </TableRow>
                )}
                {services.fields.map((field, i) => {
                  const line = values.services?.[i];
                  const result = breakdown?.services[i];
                  const catalog = line ? serviceCatalog.get(line.serviceCostId) : undefined;
                  const overridden = catalog !== undefined && n(line?.unitCost) !== catalog.unitCost;
                  const lineErr = err.services?.[i];
                  return (
                    <TableRow key={field.id}>
                      <TableCell className="pl-5">
                        <Label htmlFor={`${formId}-s-${i}`} className="sr-only">
                          Proceso {i + 1}
                        </Label>
                        <NativeSelect
                          id={`${formId}-s-${i}`}
                          aria-invalid={lineErr?.serviceCostId ? true : undefined}
                          {...register(`services.${i}.serviceCostId`, { onChange: (e) => fillService(i, e.target.value) })}
                        >
                          <option value="">Elegí un proceso…</option>
                          {SERVICE_TYPE_ORDER.map((type) => {
                            const opts = data.services.filter((s) => s.type === type);
                            if (opts.length === 0) return null;
                            return (
                              <optgroup key={type} label={SERVICE_TYPE_LABELS[type]}>
                                {opts.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                    {s.workshopName ? ` — ${s.workshopName}` : ""} ({formatMoney(s.unitCost)}/{s.unitLabel})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </NativeSelect>
                        {line?.serviceCostId && line.type && (
                          <div className="mt-1.5">
                            <Badge variant="outline">{SERVICE_TYPE_LABELS[line.type]}</Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          aria-label={`Cantidad de ${line?.name || `proceso ${i + 1}`}`}
                          aria-invalid={lineErr?.quantity ? true : undefined}
                          className="ml-auto w-24 text-right"
                          {...register(`services.${i}.quantity`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          aria-label={`Tarifa de ${line?.name || `proceso ${i + 1}`}`}
                          aria-invalid={lineErr?.unitCost ? true : undefined}
                          className={overridden ? "ml-auto w-28 border-accent text-right" : "ml-auto w-28 text-right"}
                          {...register(`services.${i}.unitCost`, { valueAsNumber: true })}
                        />
                        {overridden && catalog && (
                          <p className="mt-1 text-xs text-accent-strong">Vigente {formatMoney(catalog.unitCost)}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {result ? formatMoney(result.subtotal) : "—"}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar ${line?.name || `proceso ${i + 1}`}`}
                          onClick={() => services.remove(i)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {breakdown && services.fields.length > 0 && (
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="pl-5">
                      Total procesos
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(breakdown.servicesCost)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </Card>
        </div>

        {/* Columna lateral ---------------------------------------------------- */}
        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Parámetros de precio</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex flex-col gap-2">
                <Label htmlFor={`${formId}-mode`}>Criterio</Label>
                <NativeSelect id={`${formId}-mode`} {...register("pricingMode")}>
                  <option value="MARKUP">Markup sobre costo</option>
                  <option value="MARGIN">Margen sobre precio</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-pct`}>{values.pricingMode === "MARGIN" ? "Margen %" : "Markup %"}</Label>
                <Input
                  id={`${formId}-pct`}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={0}
                  aria-invalid={err.pricingPct ? true : undefined}
                  className="text-right"
                  {...register("pricingPct", { valueAsNumber: true })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-oh`}>Gastos generales %</Label>
                <Input
                  id={`${formId}-oh`}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  aria-invalid={err.overheadPct ? true : undefined}
                  className="text-right"
                  {...register("overheadPct", { valueAsNumber: true })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-vat`}>IVA %</Label>
                <NativeSelect id={`${formId}-vat`} {...register("vatRate", { valueAsNumber: true })}>
                  <option value={21}>21%</option>
                  <option value={10.5}>10,5%</option>
                  <option value={0}>Exento</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${formId}-round`}>Redondeo final</Label>
                <NativeSelect id={`${formId}-round`} {...register("priceRoundingStep", { valueAsNumber: true })}>
                  {ROUNDING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r === 0 ? "Sin redondeo" : `Múltiplo de ${formatMoney(r, { round: true })}`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simular reposición de telas</CardTitle>
              <CardDescription>Variación aplicada a todas las telas. No se guarda.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-30}
                  max={60}
                  step={1}
                  aria-label="Variación de precio de telas"
                  className="h-11 flex-1 accent-[var(--accent)]"
                  {...register("fabricShockPct", { valueAsNumber: true })}
                />
                <output className="w-16 text-right font-mono text-sm font-semibold tabular-nums">
                  {n(values.fabricShockPct) > 0 ? "+" : ""}
                  {n(values.fabricShockPct)}%
                </output>
              </div>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Variaciones rápidas">
                {[-10, 0, 10, 25].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={n(values.fabricShockPct) === v ? "default" : "outline"}
                    aria-pressed={n(values.fabricShockPct) === v}
                    onClick={() => setValue("fabricShockPct", v, { shouldDirty: true })}
                  >
                    {v > 0 ? "+" : ""}
                    {v}%
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {breakdown ? (
            <CostSummaryPanel breakdown={breakdown} />
          ) : (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {preview.error}
            </p>
          )}

          {canEdit && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={applySuggestedPrice}
              onChange={(e) => setApplySuggestedPrice(e.target.checked)}
            />
            Al guardar, actualizar el precio de lista con el sugerido
            {breakdown && <span className="ml-auto font-mono tabular-nums">{formatMoney(breakdown.suggestedNetPrice)}</span>}
          </label>
          )}
          {!canEdit && (
            <p className="text-xs text-muted-foreground">Modo simulación: tu rol no permite guardar cambios en la ficha.</p>
          )}
          {canEdit && simulated && (
            <p className="text-xs text-muted-foreground">
              Al guardar se usan siempre los precios de reposición vigentes; los valores simulados no se persisten.
            </p>
          )}
        </aside>
      </div>
    </form>
  );
}
