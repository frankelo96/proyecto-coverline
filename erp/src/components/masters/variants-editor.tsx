"use client";

import { Loader2, Plus, Save, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { parseLocaleNumber } from "@/lib/masters/fields";
import type { SaveVariantsInput } from "@/lib/validations/catalog";
import { cn } from "@/lib/utils";
import { saveVariantsAction } from "@/server/actions/catalog.actions";

export interface VariantRow {
  id: string | null;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  stockQty: string;
  priceAdjustmentPct: string;
  active: boolean;
}

const COMMON_CURVES = ["XS, S, M, L, XL, XXL", "4, 6, 8, 10, 12, 14, 16", "36, 38, 40, 42, 44, 46, 48", "U"];

export function VariantsEditor({ productId, initial, canWrite }: { productId: string; initial: VariantRow[]; canWrite: boolean }) {
  const uid = useId();
  const [rows, setRows] = useState<VariantRow[]>(initial);
  const [curve, setCurve] = useState("");
  const [color, setColor] = useState("");
  const router = useRouter();
  const { pending, status, setStatus, execute } = useServerAction();

  const update = (i: number, patch: Partial<VariantRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const blank = (size = "", c = ""): VariantRow => ({ id: null, size, color: c, sku: "", barcode: "", stockQty: "0", priceAdjustmentPct: "0", active: true });

  function generate() {
    const sizes = curve
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const existing = new Set(rows.map((r) => `${r.size}|${r.color.toLowerCase()}`));
    const added = sizes.filter((s) => !existing.has(`${s}|${color.trim().toLowerCase()}`)).map((s) => blank(s, color.trim()));
    setRows((prev) => [...prev, ...added]);
    setStatus(added.length ? null : { kind: "error", text: "Esos talles ya están cargados" });
  }

  function save() {
    const variants: SaveVariantsInput["variants"] = [];
    for (const r of rows) {
      const stock = parseLocaleNumber(r.stockQty || "0");
      const adj = parseLocaleNumber(r.priceAdjustmentPct || "0");
      if (stock === null || adj === null) {
        setStatus({ kind: "error", text: `Talle ${r.size || "(sin talle)"}: revisá stock y ajuste` });
        return;
      }
      variants.push({
        id: r.id,
        size: r.size,
        color: r.color.trim() || null,
        sku: r.sku.trim() || null,
        barcode: r.barcode.trim() || null,
        stockQty: stock,
        priceAdjustmentPct: adj,
        active: r.active,
      });
    }
    // La página remonta el editor con los ids nuevos (key) y muestra el aviso por URL.
    execute(
      () => saveVariantsAction({ productId, variants }),
      (_, message) => router.replace(`?aviso=${encodeURIComponent(message)}`, { scroll: false }),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Talles, colores y stock</CardTitle>
        <CardDescription>
          Cada combinación de talle y color es un artículo vendible en el POS. El SKU se genera solo si lo dejás vacío. Para ocultar un talle, desmarcá “Activo”.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/40 p-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor={`${uid}-curve`}>Agregar curva de talles</Label>
              <Input id={`${uid}-curve`} list={`${uid}-curves`} value={curve} onChange={(e) => setCurve(e.target.value)} placeholder="S, M, L, XL" />
              <datalist id={`${uid}-curves`}>
                {COMMON_CURVES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor={`${uid}-color`}>Color (opcional)</Label>
              <Input id={`${uid}-color`} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Azul marino" />
            </div>
            <Button type="button" variant="outline" onClick={generate} disabled={!curve.trim()}>
              <Wand2 /> Generar
            </Button>
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24 pl-3">Talle</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Código de barras</TableHead>
                <TableHead className="w-28 text-right">Stock</TableHead>
                <TableHead className="w-28 text-right">Ajuste %</TableHead>
                <TableHead className="w-20 pr-3 text-center">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sin talles cargados: generá una curva arriba o agregá uno por uno.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={r.id ?? `new-${i}`} className={cn(!r.active && "opacity-60")}>
                  <TableCell className="pl-3">
                    <Input aria-label="Talle" value={r.size} onChange={(e) => update(i, { size: e.target.value.toUpperCase() })} disabled={!canWrite} className="h-9 uppercase" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Color" value={r.color} onChange={(e) => update(i, { color: e.target.value })} disabled={!canWrite} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="SKU" value={r.sku} placeholder="automático" onChange={(e) => update(i, { sku: e.target.value.toUpperCase() })} disabled={!canWrite} className="h-9 font-mono text-xs uppercase" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Código de barras" value={r.barcode} onChange={(e) => update(i, { barcode: e.target.value })} disabled={!canWrite} className="h-9 font-mono text-xs" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Stock" inputMode="decimal" value={r.stockQty} onChange={(e) => update(i, { stockQty: e.target.value })} disabled={!canWrite} className="h-9 text-right" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Ajuste de precio %" inputMode="decimal" value={r.priceAdjustmentPct} onChange={(e) => update(i, { priceAdjustmentPct: e.target.value })} disabled={!canWrite} className="h-9 text-right" />
                  </TableCell>
                  <TableCell className="pr-3 text-center">
                    <input type="checkbox" aria-label="Activo" className="size-4 accent-primary" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} disabled={!canWrite} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <StatusMessage status={status} />
        {canWrite && (
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setRows((prev) => [...prev, blank()])}>
              <Plus /> Agregar talle
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar talles y stock
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
