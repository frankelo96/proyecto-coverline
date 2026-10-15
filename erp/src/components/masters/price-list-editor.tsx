"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { listNetPrice } from "@/lib/pos/price-lists";
import { savePriceListAction, savePriceListItemsAction } from "@/server/actions/price-lists.actions";

export interface PriceListData {
  id: string | null;
  name: string;
  adjustmentPct: number;
  notes: string | null;
  active: boolean;
  prices: Record<string, number>;
}

const show = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","));

/** Datos de la lista (nombre, ajuste general) y precios fijos por producto. */
export function PriceListEditor({ list, products, canWrite }: { list: PriceListData; products: { id: string; sku: string; name: string; listPrice: number; vatRate: number }[]; canWrite: boolean }) {
  const id = useId();
  const router = useRouter();
  const [form, setForm] = useState({ name: list.name, adjustmentPct: show(list.adjustmentPct), notes: list.notes ?? "", active: list.active });
  const head = useServerAction();
  const prices = useServerAction();
  const [fixed, setFixed] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.id, show(list.prices[p.id])])));
  const [filter, setFilter] = useState("");
  const adj = parseLocaleNumber(form.adjustmentPct || "0") ?? 0;
  const rule = useMemo(() => ({ id: list.id ?? "", name: form.name, adjustmentPct: adj, prices: {} as Record<string, number> }), [list.id, form.name, adj]);
  const changed = products.filter((p) => fixed[p.id] !== show(list.prices[p.id]));
  const visible = products.filter((p) => !filter.trim() || `${p.name} ${p.sku}`.toLowerCase().includes(filter.trim().toLowerCase()));

  function saveHead() {
    head.execute(
      () => savePriceListAction({ id: list.id, name: form.name.trim(), adjustmentPct: adj, notes: form.notes.trim() || null, active: form.active }),
      (d) => {
        if (!list.id) router.push(`/maestros/listas-precios?lista=${d.id}`);
      },
    );
  }

  function savePrices() {
    const items: { productId: string; netPrice: number | null }[] = [];
    for (const p of changed) {
      const raw = fixed[p.id].trim();
      const n = raw === "" ? null : parseLocaleNumber(raw);
      if (raw !== "" && (n === null || n < 0)) {
        prices.setStatus({ kind: "error", text: `${p.name}: precio inválido "${raw}"` });
        return;
      }
      items.push({ productId: p.id, netPrice: n });
    }
    prices.execute(() => savePriceListItemsAction({ priceListId: list.id, items }));
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-3 sm:grid-cols-[2fr_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          saveHead();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-n`}>Nombre</Label>
          <Input id={`${id}-n`} value={form.name} maxLength={60} disabled={!canWrite} placeholder="Ej. Mayorista, Colegios, Empresas" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-a`}>Ajuste general sobre el precio de lista (%)</Label>
          <Input id={`${id}-a`} value={form.adjustmentPct} inputMode="decimal" disabled={!canWrite} placeholder="Ej. -20" onChange={(e) => setForm({ ...form, adjustmentPct: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-o`}>Notas</Label>
          <Textarea id={`${id}-o`} value={form.notes} maxLength={300} rows={2} disabled={!canWrite} placeholder="Ej. mínimo 12 prendas por compra" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={form.active} disabled={!canWrite} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activa
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Negativo descuenta (−20 = 20% menos que el minorista), positivo recarga. El ajuste por talle se aplica igual. Los precios fijos de abajo reemplazan al ajuste para ese producto.
        </p>
        <StatusMessage status={head.status} />
        {canWrite && (
          <Button type="submit" className="w-fit" disabled={head.pending || form.name.trim().length < 2}>
            {head.pending ? <Loader2 className="animate-spin" /> : <Save />} {list.id ? "Guardar lista" : "Crear lista"}
          </Button>
        )}
      </form>

      {list.id && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-lg font-semibold">Precios por producto</h3>
            <Input aria-label="Filtrar productos" placeholder="Filtrar por nombre o SKU" className="w-64" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Minorista neto</TableHead>
                  <TableHead className="text-right">Con el ajuste</TableHead>
                  <TableHead className="text-right">Precio fijo neto</TableHead>
                  <TableHead className="text-right">Final con IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => {
                  const f = parseLocaleNumber(fixed[p.id] || "");
                  const net = f && f > 0 ? f : listNetPrice(p.listPrice, p.id, rule);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.name}
                        <span className="block font-mono text-xs text-muted-foreground">{p.sku}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.listPrice)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{formatMoney(listNetPrice(p.listPrice, p.id, rule))}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          aria-label={`Precio fijo de ${p.name}`}
                          className="ml-auto h-8 w-32 text-right"
                          inputMode="decimal"
                          placeholder="—"
                          disabled={!canWrite}
                          value={fixed[p.id]}
                          onChange={(e) => setFixed((cur) => ({ ...cur, [p.id]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{formatMoney(net * (1 + p.vatRate / 100))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <StatusMessage status={prices.status} />
          {canWrite && (
            <Button className="w-fit" disabled={prices.pending || changed.length === 0} onClick={savePrices}>
              {prices.pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar precios{changed.length ? ` (${changed.length})` : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
