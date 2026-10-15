"use client";

import { Printer, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { encodeLabelItems, LABEL_FORMATS } from "@/lib/catalog/labels";

export interface LabelVariant {
  id: string;
  productId: string;
  productName: string;
  label: string;
  sku: string;
  barcode: string | null;
  stocks: Record<string, number>;
}

/** Arma la lista de etiquetas: productos, cantidad por talle/color, formato y precio. */
export function LabelBuilder({
  products,
  selected,
  variants,
  branches,
  initialQty,
}: {
  products: { id: string; name: string; sku: string }[];
  selected: string[];
  variants: LabelVariant[];
  branches: { id: string; name: string }[];
  initialQty: Record<string, number>;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialQty).map(([k, v]) => [k, String(v)])));
  const [format, setFormat] = useState(LABEL_FORMATS[0].key);
  const [withPrice, setWithPrice] = useState(true);
  const [skip, setSkip] = useState("0");

  const setProducts = (ids: string[]) => router.replace(ids.length ? `${pathname}?productos=${ids.join(",")}` : pathname);
  const items = variants.map((v) => ({ variantId: v.id, qty: Math.max(0, Math.floor(Number(qty[v.id] || 0))) })).filter((i) => i.qty > 0);
  const total = items.reduce((a, i) => a + i.qty, 0);
  const fmt = LABEL_FORMATS.find((f) => f.key === format)!;
  const href = `/etiquetas?${new URLSearchParams({ items: encodeLabelItems(items), formato: format, precio: withPrice ? "1" : "0", saltear: fmt.kind === "a4" ? skip : "0" })}`;
  const fill = (fn: (v: LabelVariant) => number) => setQty(Object.fromEntries(variants.map((v) => [v.id, String(Math.max(0, Math.floor(fn(v))))])));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-72 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-add`}>Agregar producto</Label>
          <NativeSelect id={`${id}-add`} value="" onChange={(e) => e.target.value && setProducts([...selected, e.target.value])}>
            <option value="">Elegí un producto…</option>
            {products
              .filter((p) => !selected.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
          </NativeSelect>
        </div>
        {selected.map((pid) => {
          const p = products.find((x) => x.id === pid);
          return (
            p && (
              <Button key={pid} type="button" variant="outline" size="sm" onClick={() => setProducts(selected.filter((x) => x !== pid))} aria-label={`Quitar ${p.name}`}>
                {p.name} <X />
              </Button>
            )
          );
        })}
      </div>

      {variants.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Completar cantidades:</span>
            <Button type="button" size="sm" variant="outline" onClick={() => fill(() => 1)}>
              1 de cada uno
            </Button>
            {branches.map((b) => (
              <Button key={b.id} type="button" size="sm" variant="outline" onClick={() => fill((v) => v.stocks[b.id] ?? 0)}>
                Stock de {b.name}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => fill(() => 0)}>
              Poner en 0
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-3">Artículo</TableHead>
                  <TableHead>Código de barras</TableHead>
                  {branches.map((b) => (
                    <TableHead key={b.id} className="text-right">
                      {b.name}
                    </TableHead>
                  ))}
                  <TableHead className="w-28 pr-3 text-right">Etiquetas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-3">
                      {v.label}
                      <span className="block font-mono text-xs text-muted-foreground">{v.sku}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{v.barcode ?? <span className="text-destructive">sin código</span>}</TableCell>
                    {branches.map((b) => (
                      <TableCell key={b.id} className="text-right font-mono tabular-nums">
                        {v.stocks[b.id] ?? 0}
                      </TableCell>
                    ))}
                    <TableCell className="pr-3">
                      <Input
                        aria-label={`Etiquetas de ${v.label}`}
                        inputMode="numeric"
                        className="h-8 text-right"
                        value={qty[v.id] ?? ""}
                        onChange={(e) => setQty({ ...qty, [v.id]: e.target.value.replace(/\D/g, "") })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <div className="grid gap-4 rounded-md border bg-muted/40 p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-fmt`}>Formato</Label>
          <NativeSelect id={`${id}-fmt`} value={format} onChange={(e) => setFormat(e.target.value)}>
            {LABEL_FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {fmt.kind === "a4" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-skip`}>Saltear etiquetas ya usadas</Label>
            <Input id={`${id}-skip`} inputMode="numeric" value={skip} onChange={(e) => setSkip(e.target.value.replace(/\D/g, ""))} />
          </div>
        ) : (
          <div />
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={withPrice} onChange={(e) => setWithPrice(e.target.checked)} />
          Mostrar precio
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild disabled={total === 0}>
          <a href={total ? href : undefined} target="_blank" rel="noopener" aria-disabled={total === 0}>
            <Printer /> Ver e imprimir {total} etiquetas
          </a>
        </Button>
        {total > 500 && <span className="text-sm text-destructive">Máximo 500 etiquetas por impresión: dividilo en tandas.</span>}
      </div>
    </div>
  );
}
