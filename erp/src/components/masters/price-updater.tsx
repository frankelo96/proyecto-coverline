"use client";

import { Loader2, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney, formatPct } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { newListPrice, type PricedProduct } from "@/lib/pricing/mass-update";
import { cn } from "@/lib/utils";
import { applyPriceUpdateAction } from "@/server/actions/finance.actions";

export interface UpdatableProduct extends PricedProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
}

const ROUNDINGS = [0, 10, 50, 100, 500, 1000];

export function PriceUpdater({ products }: { products: UpdatableProduct[] }) {
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<"PCT" | "COST">("PCT");
  const [pct, setPct] = useState("10");
  const [roundTo, setRoundTo] = useState(100);
  const [reason, setReason] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const { pending, status, execute } = useServerAction();
  const pctValue = parseLocaleNumber(pct) ?? 0;

  const rows = useMemo(
    () =>
      products.map((p) => {
        const next = newListPrice(p, mode === "PCT" ? { mode: "PCT", pct: pctValue } : { mode: "COST" }, roundTo);
        const currentFinal = p.listPrice * (1 + p.vatRate / 100);
        return { p, next, currentFinal, deltaPct: next && p.listPrice > 0 ? ((next.net - p.listPrice) / p.listPrice) * 100 : null };
      }),
    [products, mode, pctValue, roundTo],
  );
  const selected = rows.filter((r) => r.next && !excluded.has(r.p.id) && Math.abs(r.next.net - r.p.listPrice) >= 0.01);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-m`}>Cómo</Label>
          <NativeSelect id={`${id}-m`} value={mode} onChange={(e) => setMode(e.target.value as "PCT" | "COST")}>
            <option value="PCT">Aumentar un porcentaje</option>
            <option value="COST">Llevar al precio sugerido por costo</option>
          </NativeSelect>
        </div>
        {mode === "PCT" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-p`}>Porcentaje</Label>
            <Input id={`${id}-p`} inputMode="decimal" className="text-right" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ej. 8,5 (o -5 para bajar)" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-r`}>Redondear el precio final a</Label>
          <NativeSelect id={`${id}-r`} value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}>
            {ROUNDINGS.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? "Sin redondeo" : `$${r.toLocaleString("es-AR")}`}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-o`}>Motivo *</Label>
          <Input id={`${id}-o`} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. aumento de proveedores octubre" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Todos"
                  className="size-4"
                  checked={excluded.size === 0}
                  onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(products.map((p) => p.id)))}
                />
              </TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio final hoy</TableHead>
              <TableHead className="text-right">Precio final nuevo</TableHead>
              <TableHead className="text-right">Variación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ p, next, currentFinal, deltaPct }) => (
              <TableRow key={p.id} className={cn(excluded.has(p.id) && "opacity-50")}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Actualizar ${p.name}`}
                    className="size-4"
                    disabled={!next}
                    checked={!!next && !excluded.has(p.id)}
                    onChange={() =>
                      setExcluded((cur) => {
                        const n = new Set(cur);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  {p.name}
                  <span className="block font-mono text-xs text-muted-foreground">{p.sku}</span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{p.currentCost > 0 ? formatMoney(p.currentCost) : "—"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{p.listPrice > 0 ? formatMoney(currentFinal) : "—"}</TableCell>
                <TableCell className="text-right font-mono font-medium tabular-nums">{next ? formatMoney(next.final) : <span className="text-xs text-muted-foreground">sin datos</span>}</TableCell>
                <TableCell className={cn("text-right tabular-nums", deltaPct !== null && deltaPct < 0 && "text-destructive")}>
                  {deltaPct === null ? "—" : `${deltaPct > 0 ? "+" : ""}${formatPct(deltaPct)}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <StatusMessage status={status} />
      <Button
        className="w-fit"
        disabled={pending || selected.length === 0 || reason.trim().length < 3}
        onClick={() =>
          execute(
            () => applyPriceUpdateAction({ reason: reason.trim(), items: selected.map((r) => ({ productId: r.p.id, expected: r.p.listPrice, listPrice: r.next!.net })) }),
            () => router.refresh(),
          )
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <TrendingUp />} Actualizar {selected.length} precios
      </Button>
    </div>
  );
}
