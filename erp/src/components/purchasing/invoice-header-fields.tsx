"use client";

import { useId } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PURCHASE_INVOICE_LABELS, PURCHASE_INVOICE_TYPES } from "@/lib/validations/purchasing";

/** "" → null para campos opcionales de texto / número. */
export const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
export const numOrNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
export const numOrZero = (v: unknown) => (v === "" || v === null || v === undefined ? 0 : Number(v));

/** Datos del comprobante comunes a compras de mercadería y facturas de taller. */
export function InvoiceHeaderFields<T extends FieldValues>({ form, dueHint }: { form: UseFormReturn<T>; dueHint: string }) {
  const id = useId();
  const { register, watch, formState } = form;
  const p = (name: string) => name as Path<T>;
  const invoiceType = watch(p("invoiceType")) as string;
  const err = formState.errors as Record<string, { message?: string } | undefined>;
  const hasInvoice = invoiceType !== "TICKET_INTERNO";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-type`}>Comprobante</Label>
        <NativeSelect id={`${id}-type`} {...register(p("invoiceType"))}>
          {PURCHASE_INVOICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {PURCHASE_INVOICE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {hasInvoice ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-pv`}>Punto de venta y número</Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-pv`}
              inputMode="numeric"
              placeholder="00001"
              aria-label="Punto de venta"
              className="w-24"
              aria-invalid={err.invoiceNumber ? true : undefined}
              {...register(p("pointOfSale"), { setValueAs: numOrNull })}
            />
            <Input
              inputMode="numeric"
              placeholder="00001234"
              aria-label="Número de comprobante"
              aria-invalid={err.invoiceNumber ? true : undefined}
              {...register(p("invoiceNumber"), { setValueAs: emptyToNull })}
            />
          </div>
          {err.invoiceNumber?.message && <p className="text-xs text-destructive">{err.invoiceNumber.message}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-remit`}>N° de remito</Label>
          <Input id={`${id}-remit`} {...register(p("remitNumber"), { setValueAs: emptyToNull })} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-date`}>Fecha</Label>
        <Input id={`${id}-date`} type="date" {...register(p("date"))} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-due`}>Vencimiento</Label>
        <Input id={`${id}-due`} type="date" {...register(p("dueDate"), { setValueAs: emptyToNull })} />
        <p className="text-xs text-muted-foreground">{dueHint}</p>
      </div>
      {hasInvoice && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-piva`}>Percepción IVA</Label>
            <Input id={`${id}-piva`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" {...register(p("perceptionIva"), { setValueAs: numOrZero })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-piibb`}>Percepción IIBB</Label>
            <Input id={`${id}-piibb`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" {...register(p("perceptionIibb"), { setValueAs: numOrZero })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-other`}>Otros impuestos</Label>
            <Input id={`${id}-other`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" {...register(p("otherTaxes"), { setValueAs: numOrZero })} />
          </div>
        </>
      )}
      {hasInvoice && invoiceType !== "FACTURA_A" && (
        <p className="self-end text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">
          Este comprobante no discrimina IVA: cargá precios finales.
        </p>
      )}
    </div>
  );
}
