"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { variantAttrs } from "@/lib/catalog/variants";
import { createBatchSchema, type CreateBatchInput } from "@/lib/validations/production";
import { createBatchAction } from "@/server/actions/production.actions";
import type { NewOrderFormData } from "@/server/queries/production-orders.queries";

export interface NewOrderPrefill {
  productId?: string | null;
  clientId?: string | null;
  notes?: string | null;
}

type Product = NewOrderFormData["products"][number];

function productBlock(p: Product | undefined): CreateBatchInput["products"][number] {
  return { productId: p?.id ?? "", requiresPersonalization: p?.hasPersonalization ?? false, items: p ? p.variants.map((v) => ({ variantId: v.id, quantity: 0 })) : [] };
}

const sumQty = (items: { quantity: number }[] | undefined) => (items ?? []).reduce((a, i) => a + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);

/** Primer mensaje de error de zod/RHF, recorriendo arrays y objetos anidados. */
function firstError(errors: unknown): string | undefined {
  if (!errors || typeof errors !== "object") return undefined;
  const e = errors as { message?: unknown };
  if (typeof e.message === "string" && e.message) return e.message;
  for (const v of Object.values(errors)) {
    if (v && typeof v === "object" && !(v instanceof Element)) {
      const m = firstError(v);
      if (m) return m;
    }
  }
  return undefined;
}

export function NewOrderForm({ data, prefill }: { data: NewOrderFormData; prefill?: NewOrderPrefill }) {
  const formId = useId();
  const router = useRouter();
  const { pending, status, setStatus, execute } = useServerAction();
  const form = useForm<CreateBatchInput>({
    resolver: zodResolver(createBatchSchema),
    defaultValues: {
      // Precarga desde un presupuesto aceptado o la ficha del cliente.
      clientId: data.clients.some((c) => c.id === prefill?.clientId) ? prefill!.clientId! : null,
      dueDate: null,
      notes: prefill?.notes ?? null,
      products: [productBlock(data.products.find((x) => x.id === prefill?.productId))],
    },
  });
  const { register, setValue, handleSubmit, control, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "products" });
  const products = useWatch({ control, name: "products" });
  const grandTotal = (products ?? []).reduce((a, p) => a + sumQty(p.items), 0);
  const chosen = new Set((products ?? []).map((p) => p.productId).filter(Boolean));

  const onSubmit = handleSubmit(
    (values) =>
      execute(
        () => createBatchAction({ ...values, clientId: values.clientId || null, dueDate: values.dueDate || null, notes: values.notes || null }),
        (created) => router.push(`/produccion/comprobantes/${created.id}`),
      ),
    (errors: FieldErrors<CreateBatchInput>) => setStatus({ kind: "error", text: firstError(errors) ?? "Revisá los datos de la orden" }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Cliente y entrega</CardTitle>
          <CardDescription>Se aplican a todos los productos del comprobante.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-client`}>Cliente (opcional, para pedidos a medida)</Label>
            <NativeSelect id={`${formId}-client`} {...register("clientId")}>
              <option value="">Stock propio</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-due`}>Fecha comprometida</Label>
            <Input id={`${formId}-due`} type="date" {...register("dueDate")} />
          </div>
        </CardContent>
      </Card>

      {fields.map((field, index) => (
        <ProductCard
          key={field.id}
          index={index}
          count={fields.length}
          data={data}
          chosen={chosen}
          control={control}
          register={register}
          setValue={setValue}
          invalid={!!formState.errors.products?.[index]}
          onRemove={() => remove(index)}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => append(productBlock(undefined))} disabled={fields.length >= 50}>
          <Plus /> Agregar producto
        </Button>
        <p className="text-sm">
          {fields.length} {fields.length === 1 ? "producto" : "productos"} · Total general: <strong className="font-mono tabular-nums">{grandTotal}</strong> prendas
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-notes`}>Observaciones</Label>
        <textarea
          id={`${formId}-notes`}
          rows={3}
          maxLength={500}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          {...register("notes")}
        />
      </div>

      <StatusMessage status={status} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} {fields.length > 1 ? `Crear ${fields.length} órdenes` : "Crear orden"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ProductCard({
  index,
  count,
  data,
  chosen,
  control,
  register,
  setValue,
  invalid,
  onRemove,
}: {
  index: number;
  count: number;
  data: NewOrderFormData;
  chosen: Set<string>;
  control: Control<CreateBatchInput>;
  register: UseFormRegister<CreateBatchInput>;
  setValue: UseFormSetValue<CreateBatchInput>;
  invalid: boolean;
  onRemove: () => void;
}) {
  const formId = useId();
  const productId = useWatch({ control, name: `products.${index}.productId` });
  const items = useWatch({ control, name: `products.${index}.items` });
  const product = data.products.find((p) => p.id === productId);
  const total = sumQty(items);

  function onProductChange(id: string) {
    const b = productBlock(data.products.find((x) => x.id === id));
    setValue(`products.${index}.items`, b.items);
    setValue(`products.${index}.requiresPersonalization`, b.requiresPersonalization);
  }

  return (
    <Card className={invalid ? "border-destructive" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Producto {index + 1}</CardTitle>
          <CardDescription>{product ? "Cantidades a producir por color, tela y talle." : "Elegí una prenda para cargar la curva."}</CardDescription>
        </div>
        {count > 1 && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove} aria-label={`Quitar producto ${index + 1}`}>
            <Trash2 /> Quitar
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-product`}>Prenda</Label>
          <NativeSelect id={`${formId}-product`} {...register(`products.${index}.productId`, { onChange: (e) => onProductChange(e.target.value) })}>
            <option value="">Elegí una prenda…</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.hasBom || p.variants.length === 0 || (chosen.has(p.id) && p.id !== productId)}>
                {p.sku} · {p.name}
                {!p.hasBom ? " (sin ficha técnica)" : p.variants.length === 0 ? " (sin talles)" : chosen.has(p.id) && p.id !== productId ? " (ya cargada)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register(`products.${index}.requiresPersonalization`)} />
          Pasa por personalización (bordado, estampado o sublimación)
        </label>
        {product && (
          <>
            {/* Una fila de talles por cada combinación de color y tela. */}
            {[...new Set(product.variants.map((v) => variantAttrs(v)))].map((group) => (
              <div key={group || "unico"} className="flex flex-col gap-2">
                {group && <p className="text-sm font-medium">{group}</p>}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {product.variants.map((v, i) =>
                    variantAttrs(v) !== group ? null : (
                      <div key={v.id} className="flex flex-col gap-1.5">
                        <Label htmlFor={`${formId}-size-${v.id}`} className="text-center">
                          {v.size}
                        </Label>
                        <Input
                          id={`${formId}-size-${v.id}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          className="text-center"
                          aria-label={`Cantidad talle ${v.size}${group ? ` ${group}` : ""}`}
                          {...register(`products.${index}.items.${i}.quantity`, { valueAsNumber: true })}
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
            <p className="text-sm">
              Subtotal: <strong className="font-mono tabular-nums">{total}</strong> prendas
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
