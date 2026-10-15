"use client";

import { Loader2, Plus, Save, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { combineVariants, splitValues, variantKey, variantOptions } from "@/lib/catalog/variants";
import { formatNumber } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { webQuantity } from "@/lib/woo/stock";
import type { SaveVariantsInput } from "@/lib/validations/catalog";
import { cn } from "@/lib/utils";
import { saveVariantsAction } from "@/server/actions/catalog.actions";

export interface VariantRow {
  id: string | null;
  size: string;
  color: string;
  fabric: string;
  sku: string;
  barcode: string;
  /** Stock por local (id del local → cantidad escrita) */
  stocks: Record<string, string>;
  priceAdjustmentPct: string;
  active: boolean;
}

const COMMON_CURVES = ["XS, S, M, L, XL, XXL", "4, 6, 8, 10, 12, 14, 16", "36, 38, 40, 42, 44, 46, 48", "U"];

/**
 * Talles, colores y telas de un producto: se cargan las listas y se generan
 * todas las combinaciones; cada una es un artículo vendible con su stock.
 */
export function VariantsEditor({
  productId,
  initial,
  canWrite,
  fabricSuggestions,
  branches,
  webSafety,
}: {
  productId: string;
  initial: VariantRow[];
  canWrite: boolean;
  fabricSuggestions: string[];
  /** Locales; el primero es el principal (recibe el stock inicial al generar). El mayorista no se publica en la web. */
  branches: { id: string; name: string; kind: "LOCAL" | "MAYORISTA" }[];
  /** Margen de seguridad de la tienda web */
  webSafety: number;
}) {
  const uid = useId();
  const [rows, setRows] = useState<VariantRow[]>(initial);
  // Stock que mostraba la pantalla al abrirse: al guardar se manda solo lo que cambió.
  const [loaded] = useState(() => new Map(initial.filter((r) => r.id).map((r) => [r.id!, r.stocks])));
  const [gen, setGen] = useState({ sizes: "", colors: "", fabrics: "", stock: "0" });
  const router = useRouter();
  const { pending, status, setStatus, execute } = useServerAction();

  const update = (i: number, patch: Partial<VariantRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const blank = (size = "", color = "", fabric = "", stock = "0"): VariantRow => ({
    id: null,
    size,
    color,
    fabric,
    sku: "",
    barcode: "",
    stocks: Object.fromEntries(branches.map((b, i) => [b.id, i === 0 ? stock : "0"])),
    priceAdjustmentPct: "0",
    active: true,
  });

  const planned = combineVariants(splitValues(gen.sizes, true), splitValues(gen.colors), splitValues(gen.fabrics));
  const existing = new Set(rows.map((r) => variantKey(r)));
  const toAdd = planned.filter((v) => !existing.has(variantKey(v)));
  const options = variantOptions(rows.filter((r) => r.active && r.size));
  const rowTotal = (r: VariantRow) => branches.reduce((a, b) => a + (parseLocaleNumber(r.stocks[b.id] || "0") ?? 0), 0);
  const rowWeb = (r: VariantRow) =>
    webQuantity(
      branches.filter((b) => b.kind === "LOCAL").reduce((a, b) => a + (parseLocaleNumber(r.stocks[b.id] || "0") ?? 0), 0),
      webSafety,
    );
  const totalStock = rows.filter((r) => r.active).reduce((a, r) => a + rowTotal(r), 0);

  function generate() {
    setRows((prev) => [...prev, ...toAdd.map((v) => blank(v.size, v.color ?? "", v.fabric ?? "", gen.stock || "0"))]);
    setStatus(toAdd.length ? null : { kind: "error", text: "Esas combinaciones ya están cargadas" });
    setGen((g) => ({ ...g, sizes: "" }));
  }

  function save() {
    const variants: SaveVariantsInput["variants"] = [];
    for (const r of rows) {
      const stocks = branches.map((b) => ({ branchId: b.id, quantity: parseLocaleNumber(r.stocks[b.id] || "0") }));
      const adj = parseLocaleNumber(r.priceAdjustmentPct || "0");
      if (stocks.some((s) => s.quantity === null) || adj === null) {
        setStatus({ kind: "error", text: `Talle ${r.size || "(sin talle)"}: revisá stock y ajuste` });
        return;
      }
      variants.push({
        id: r.id,
        size: r.size,
        color: r.color.trim() || null,
        fabric: r.fabric.trim() || null,
        sku: r.sku.trim() || null,
        barcode: r.barcode.trim() || null,
        stocks: stocks.flatMap((s) => {
          const shown = r.id ? loaded.get(r.id) : undefined;
          if (!shown) return [{ branchId: s.branchId, quantity: s.quantity! }];
          const before = parseLocaleNumber(shown[s.branchId] || "0") ?? 0;
          return s.quantity === before ? [] : [{ branchId: s.branchId, quantity: s.quantity!, before }];
        }),
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
        <CardTitle>Colores, telas, talles y stock</CardTitle>
        <CardDescription>
          Un solo producto con todas sus variantes: en el POS se elige el producto y después el color, la tela y el talle. El SKU se genera solo si lo dejás vacío; para ocultar una
          variante, desmarcá “Activo”.
        </CardDescription>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
            <span>
              <strong>{rows.filter((r) => r.active).length}</strong> variantes activas · stock total <strong>{formatNumber(totalStock)}</strong>
            </span>
            {options.colors.length > 0 && <span className="text-muted-foreground">Colores: {options.colors.join(", ")}</span>}
            {options.fabrics.length > 0 && <span className="text-muted-foreground">Telas: {options.fabrics.join(", ")}</span>}
            <span className="text-muted-foreground">Talles: {options.sizes.join(" · ")}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">Generar variantes</p>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_100px]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-sizes`}>Talles</Label>
                <Input id={`${uid}-sizes`} list={`${uid}-curves`} value={gen.sizes} onChange={(e) => setGen({ ...gen, sizes: e.target.value })} placeholder="S, M, L, XL" />
                <datalist id={`${uid}-curves`}>
                  {COMMON_CURVES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-colors`}>Colores (opcional)</Label>
                <Input id={`${uid}-colors`} value={gen.colors} onChange={(e) => setGen({ ...gen, colors: e.target.value })} placeholder="Blanco, Azul marino" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-fabrics`}>Telas (opcional)</Label>
                <Input id={`${uid}-fabrics`} list={`${uid}-fabric-list`} value={gen.fabrics} onChange={(e) => setGen({ ...gen, fabrics: e.target.value })} placeholder="Algodón, Piqué" />
                <datalist id={`${uid}-fabric-list`}>
                  {fabricSuggestions.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-stock`}>Stock inicial ({branches[0]?.name ?? "local principal"})</Label>
                <Input id={`${uid}-stock`} inputMode="decimal" value={gen.stock} onChange={(e) => setGen({ ...gen, stock: e.target.value })} className="text-right" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Separá con comas. Se crea una variante por cada combinación de talle × color × tela
                {planned.length > 0 && (
                  <>
                    : <strong className="text-foreground">{toAdd.length} nuevas</strong>
                    {planned.length > toAdd.length && ` (${planned.length - toAdd.length} ya existen)`}
                  </>
                )}
                .
              </p>
              <Button type="button" variant="outline" onClick={generate} disabled={toAdd.length === 0}>
                <Wand2 /> Generar {toAdd.length > 0 ? toAdd.length : ""}
              </Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Color</TableHead>
                <TableHead>Tela</TableHead>
                <TableHead className="w-24">Talle</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Código de barras</TableHead>
                {branches.map((b) => (
                  <TableHead key={b.id} className="w-24 text-right">
                    Stock {b.name}
                  </TableHead>
                ))}
                <TableHead className="w-16 text-right">Total</TableHead>
                <TableHead className="w-16 text-right" title={`Stock de los locales (sin mayorista) menos ${webSafety} de margen`}>
                  Web
                </TableHead>
                <TableHead className="w-24 text-right">Ajuste %</TableHead>
                <TableHead className="w-16 pr-3 text-center">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9 + branches.length} className="py-8 text-center text-sm text-muted-foreground">
                    Sin variantes: cargá talles, colores y telas arriba y tocá Generar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={r.id ?? `new-${i}`} className={cn(!r.active && "opacity-60")}>
                  <TableCell className="pl-3">
                    <Input aria-label="Color" value={r.color} onChange={(e) => update(i, { color: e.target.value })} disabled={!canWrite} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Tela" list={`${uid}-fabric-list`} value={r.fabric} onChange={(e) => update(i, { fabric: e.target.value })} disabled={!canWrite} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Talle" value={r.size} onChange={(e) => update(i, { size: e.target.value.toUpperCase() })} disabled={!canWrite} className="h-9 uppercase" />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="SKU" value={r.sku} placeholder="automático" onChange={(e) => update(i, { sku: e.target.value.toUpperCase() })} disabled={!canWrite} className="h-9 font-mono text-xs uppercase" />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label="Código de barras"
                      value={r.barcode}
                      placeholder="automático"
                      inputMode="numeric"
                      onChange={(e) => update(i, { barcode: e.target.value })}
                      disabled={!canWrite}
                      className="h-9 font-mono text-xs"
                    />
                  </TableCell>
                  {branches.map((b) => (
                    <TableCell key={b.id}>
                      <Input
                        aria-label={`Stock ${b.name}`}
                        inputMode="decimal"
                        value={r.stocks[b.id] ?? "0"}
                        onChange={(e) => update(i, { stocks: { ...r.stocks, [b.id]: e.target.value } })}
                        disabled={!canWrite}
                        className="h-9 text-right"
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono tabular-nums">{formatNumber(rowTotal(r))}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{r.active ? formatNumber(rowWeb(r)) : "—"}</TableCell>
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
        {rows.some((r) => !r.id) && (
          <p className="text-sm">
            <Badge variant="accent">Sin guardar</Badge> Hay variantes nuevas: tocá “Guardar variantes y stock”.
          </p>
        )}
        <StatusMessage status={status} />
        {canWrite && (
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setRows((prev) => [...prev, blank()])}>
              <Plus /> Agregar una variante
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar variantes y stock
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
