"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { variantAttrs } from "@/lib/catalog/variants";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validations/production";
import { createOrderAction } from "@/server/actions/production.actions";
import type { NewOrderFormData } from "@/server/queries/production-orders.queries";

export interface NewOrderPrefill {
  productId?: string | null;
  clientId?: string | null;
  notes?: string | null;
}

export function NewOrderForm({ data, prefill }: { data: NewOrderFormData; prefill?: NewOrderPrefill }) {
  const formId = useId();
  const router = useRouter();
  const { pending, status, setStatus, execute } = useServerAction();
  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: (() => {
      // Precarga desde un presupuesto aceptado o la ficha del cliente.
      const p = data.products.find((x) => x.id === prefill?.productId);
      return {
        productId: p?.id ?? "",
        clientId: data.clients.some((c) => c.id === prefill?.clientId) ? prefill!.clientId! : null,
        dueDate: null,
        notes: prefill?.notes ?? null,
        requiresPersonalization: p?.hasPersonalization ?? false,
        items: p ? p.variants.map((v) => ({ variantId: v.id, quantity: 0 })) : [],
      };
    })(),
  });
  const { register, setValue, handleSubmit, control, formState } = form;
  const productId = useWatch({ control, name: "productId" });
  const items = useWatch({ control, name: "items" });
  const product = data.products.find((p) => p.id === productId);
  const total = (items ?? []).reduce((a, i) => a + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);

  function onProductChange(id: string) {
    const p = data.products.find((x) => x.id === id);
    setValue("items", p ? p.variants.map((v) => ({ variantId: v.id, quantity: 0 })) : []);
    setValue("requiresPersonalization", p?.hasPersonalization ?? false);
  }

  const onSubmit = handleSubmit(
    (values) =>
      execute(
        () => createOrderAction({ ...values, clientId: values.clientId || null, dueDate: values.dueDate || null, notes: values.notes || null }),
        (created) => router.push(`/produccion/ordenes/${created.id}`),
      ),
    (errors) => {
      const first = errors.items?.message ?? errors.items?.root?.message ?? errors.productId?.message ?? errors.dueDate?.message;
      setStatus({ kind: "error", text: first ?? "Revisá los datos de la orden" });
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Prenda y cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor={`${formId}-product`}>Prenda</Label>
            <NativeSelect
              id={`${formId}-product`}
              aria-invalid={formState.errors.productId ? true : undefined}
              {...register("productId", { onChange: (e) => onProductChange(e.target.value) })}
            >
              <option value="">Elegí una prenda…</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.hasBom || p.variants.length === 0}>
                  {p.sku} · {p.name}
                  {!p.hasBom ? " (sin ficha técnica)" : p.variants.length === 0 ? " (sin talles)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
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
          <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("requiresPersonalization")} />
            Pasa por personalización (bordado, estampado o sublimación)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curva de talles</CardTitle>
          <CardDescription>{product ? "Cantidades a producir por color, tela y talle." : "Elegí una prenda para cargar la curva."}</CardDescription>
        </CardHeader>
        {product && (
          <CardContent className="flex flex-col gap-4">
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
                          {...register(`items.${i}.quantity`, { valueAsNumber: true })}
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
            <p className="text-sm">
              Total: <strong className="font-mono tabular-nums">{total}</strong> prendas
            </p>
          </CardContent>
        )}
      </Card>

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
          {pending && <Loader2 className="animate-spin" />} Crear orden
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
