"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionStatus } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/production/workflow";
import { suggestedInvoiceType, TAX_CONDITION_LABELS, todayIso } from "@/lib/purchasing/labels";
import { computePurchaseTotals, discriminatesVat } from "@/lib/purchasing/math";
import { headerRefine, invoiceHeaderShape } from "@/lib/validations/purchasing";
import { createWorkshopInvoiceAction } from "@/server/actions/purchasing.actions";
import type { WorkshopInvoiceFormData } from "@/server/queries/purchasing.queries";

import { InvoiceHeaderFields, numOrZero } from "./invoice-header-fields";
import { TotalsBox } from "./totals-box";

const formSchema = z
  .object({
    workshopId: z.string().min(1, "Elegí el taller"),
    vatRate: z.union([z.literal(21), z.literal(10.5), z.literal(27), z.literal(0)]),
    rows: z.array(z.object({ remitId: z.string(), selected: z.boolean(), unitCost: z.number().finite().min(0, "El precio no puede ser negativo") })),
    ...invoiceHeaderShape,
  })
  .superRefine(headerRefine)
  .refine((v) => v.rows.some((r) => r.selected), { message: "Elegí al menos una recepción a facturar", path: ["rows"] });
type FormValues = z.infer<typeof formSchema>;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

export function WorkshopInvoiceForm({ data }: { data: WorkshopInvoiceFormData }) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionStatus>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      workshopId: "",
      vatRate: 21,
      rows: [],
      invoiceType: "FACTURA_C",
      pointOfSale: null,
      invoiceNumber: null,
      remitNumber: null,
      date: todayIso(),
      dueDate: null,
      perceptionIva: 0,
      perceptionIibb: 0,
      otherTaxes: 0,
      notes: null,
    },
  });
  const { control, register, setValue, handleSubmit } = form;
  const values = useWatch({ control }) as FormValues;
  const workshop = data.workshops.find((w) => w.id === values.workshopId);
  const withVat = discriminatesVat(values.invoiceType);

  function onWorkshop(workshopId: string) {
    const w = data.workshops.find((x) => x.id === workshopId);
    setValue("rows", (w?.pending ?? []).map((r) => ({ remitId: r.id, selected: true, unitCost: r.laborUnitCost })));
    if (w) setValue("invoiceType", suggestedInvoiceType(w.taxCondition));
  }

  const lines = useMemo(() => {
    if (!workshop) return [];
    return (values.rows ?? []).flatMap((row) => {
      const r = workshop.pending.find((p) => p.id === row.remitId);
      return r && row.selected ? [{ r, unitCost: n(row.unitCost) }] : [];
    });
  }, [values.rows, workshop]);

  const totals = computePurchaseTotals(
    lines.map((l) => ({ quantity: l.r.pieces, unitCost: l.unitCost, vatRate: withVat ? n(values.vatRate) : 0 })),
    { perceptionIva: n(values.perceptionIva), perceptionIibb: n(values.perceptionIibb), otherTaxes: n(values.otherTaxes) },
    values.invoiceType,
  );
  const agreed = lines.reduce((a, l) => a + l.r.laborTotal, 0);
  const priceDiff = totals.subtotal - agreed;

  const onSubmit = handleSubmit(
    (v) => {
      setStatus(null);
      startTransition(async () => {
        const res = await createWorkshopInvoiceAction({
          workshopId: v.workshopId,
          invoiceType: v.invoiceType,
          pointOfSale: v.pointOfSale,
          invoiceNumber: v.invoiceNumber,
          remitNumber: v.remitNumber,
          date: v.date,
          dueDate: v.dueDate,
          perceptionIva: v.perceptionIva,
          perceptionIibb: v.perceptionIibb,
          otherTaxes: v.otherTaxes,
          notes: v.notes,
          lines: v.rows.filter((r) => r.selected).map((r) => ({ remitId: r.remitId, unitCost: r.unitCost, vatRate: withVat ? v.vatRate : 0 })),
        });
        if (res.ok) {
          setStatus({ kind: "success", text: res.message ?? "Factura registrada" });
          router.push(`/compras/${res.data.id}`);
        } else {
          setStatus({ kind: "error", text: res.error });
        }
      });
    },
    (errors) => {
      const first = errors.workshopId?.message ?? errors.invoiceNumber?.message ?? errors.rows?.message ?? errors.rows?.root?.message;
      setStatus({ kind: "error", text: first ?? "Revisá los datos de la factura" });
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Taller y comprobante</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor={`${id}-w`}>Taller</Label>
            <NativeSelect id={`${id}-w`} {...register("workshopId", { onChange: (e) => onWorkshop(e.target.value) })}>
              <option value="">Elegí el taller…</option>
              {data.workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.pending.length} recepciones sin facturar
                </option>
              ))}
            </NativeSelect>
            {workshop && <p className="text-xs text-muted-foreground">Condición frente al IVA: {TAX_CONDITION_LABELS[workshop.taxCondition]}</p>}
          </div>
          <InvoiceHeaderFields form={form} dueHint={workshop ? `Si lo dejás vacío: fecha + ${workshop.paymentTermDays} días` : "Según plazo del taller"} />
          {withVat && (
            <div className="flex max-w-40 flex-col gap-2">
              <Label htmlFor={`${id}-vat`}>Alícuota IVA</Label>
              <NativeSelect id={`${id}-vat`} {...register("vatRate", { setValueAs: (v) => Number(v) })}>
                <option value={21}>21%</option>
                <option value={10.5}>10,5%</option>
                <option value={0}>Exento</option>
              </NativeSelect>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recepciones a facturar</CardTitle>
          <CardDescription>
            Prendas recibidas con remito y todavía no facturadas. El precio sale de la recepción; corregilo si el taller facturó distinto.
          </CardDescription>
        </CardHeader>
        {!workshop ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Elegí un taller para ver sus recepciones pendientes.</p>
          </CardContent>
        ) : workshop.pending.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Este taller no tiene recepciones pendientes de facturar.</p>
          </CardContent>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-5">
                  <span className="sr-only">Facturar</span>
                </TableHead>
                <TableHead>Recepción</TableHead>
                <TableHead>Orden / proceso</TableHead>
                <TableHead className="text-right">Prendas</TableHead>
                <TableHead className="text-right">Fasón pactado</TableHead>
                <TableHead className="text-right">Precio facturado</TableHead>
                <TableHead className="pr-5 text-right">Neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workshop.pending.map((r, i) => {
                const row = values.rows?.[i];
                const net = r.pieces * n(row?.unitCost);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="pl-5">
                      <input type="checkbox" aria-label={`Facturar recepción ${r.number}`} className="size-4 accent-[var(--primary)]" {...register(`rows.${i}.selected`)} />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">#{r.number}</span>
                      <span className="block text-xs text-muted-foreground">{shortDate(r.date)}</span>
                    </TableCell>
                    <TableCell>
                      OP #{r.orderNumber} · {r.productName}
                      <span className="block">
                        <Badge variant="outline">{STAGE_LABELS[r.stage]}</Badge>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.pieces}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.laborUnitCost)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        aria-label={`Precio facturado recepción ${r.number}`}
                        className={row && n(row.unitCost) !== r.laborUnitCost ? "ml-auto w-28 border-accent text-right" : "ml-auto w-28 text-right"}
                        {...register(`rows.${i}.unitCost`, { setValueAs: numOrZero })}
                      />
                    </TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{row?.selected ? formatMoney(net) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3">
          <p className="flex gap-2 rounded-md border bg-card p-3 text-sm text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Al registrar la factura, la deuda provisoria que generó cada recepción se reemplaza por la de la factura (los pagos ya hechos se imputan a
            la factura). Si el precio facturado difiere del pactado, se ajusta el costo real de la orden.
          </p>
          {lines.length > 0 && Math.abs(priceDiff) >= 0.01 && (
            <p className="text-sm text-accent-strong">
              Diferencia contra lo pactado en las recepciones: {priceDiff > 0 ? "+" : ""}
              {formatMoney(priceDiff)}
            </p>
          )}
        </div>
        <Card className="min-w-0 flex-[1_1_320px]">
          <CardContent>
            <TotalsBox totals={totals} />
          </CardContent>
        </Card>
      </div>

      <StatusMessage status={status} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || lines.length === 0}>
          {pending && <Loader2 className="animate-spin" />} Registrar factura de taller
        </Button>
        <Button asChild variant="outline">
          <Link href="/compras">Volver</Link>
        </Button>
      </div>
    </form>
  );
}
