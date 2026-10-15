"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { saveStockMinimumsAction } from "@/server/actions/catalog.actions";

export interface MinimumVariant {
  id: string;
  label: string;
  stocks: Record<string, number>;
  minimums: Record<string, number>;
}

const key = (variantId: string, branchId: string) => `${variantId}:${branchId}`;
const show = (n: number) => String(n).replace(".", ",");

/** Stock mínimo de cada talle en cada local. Lo que queda por debajo aparece en Reposición. */
export function StockMinimums({ branches, variants, canWrite }: { branches: { id: string; name: string }[]; variants: MinimumVariant[]; canWrite: boolean }) {
  const initial = Object.fromEntries(variants.flatMap((v) => branches.map((b) => [key(v.id, b.id), show(v.minimums[b.id] ?? 0)])));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [fillBranch, setFillBranch] = useState(branches[0]?.id ?? "");
  const [fillValue, setFillValue] = useState("");
  const { pending, status, setStatus, execute } = useServerAction();

  const changed = Object.keys(values).filter((k) => values[k] !== initial[k]);

  function save() {
    const items: { variantId: string; branchId: string; minQty: number }[] = [];
    for (const k of changed) {
      const n = parseLocaleNumber(values[k] || "0");
      if (n === null || n < 0) {
        setStatus({ kind: "error", text: `Mínimo inválido: "${values[k]}"` });
        return;
      }
      const [variantId, branchId] = k.split(":");
      items.push({ variantId, branchId, minQty: n });
    }
    execute(() => saveStockMinimumsAction({ items }));
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span className="self-center">Poner el mismo mínimo a todos los talles en</span>
          <div className="w-48">
          <NativeSelect aria-label="Local" value={fillBranch} onChange={(e) => setFillBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
          </div>
          <Input aria-label="Mínimo para todos" className="w-24" inputMode="decimal" value={fillValue} onChange={(e) => setFillValue(e.target.value)} placeholder="Ej. 3" />
          <Button
            type="button"
            variant="outline"
            disabled={!fillValue.trim()}
            onClick={() => setValues((cur) => ({ ...cur, ...Object.fromEntries(variants.map((v) => [key(v.id, fillBranch), fillValue.trim()])) }))}
          >
            Aplicar
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variante</TableHead>
              {branches.map((b) => (
                <TableHead key={b.id} className="text-center">
                  {b.name}
                  <span className="block text-xs font-normal text-muted-foreground">stock / mínimo</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="whitespace-nowrap">{v.label}</TableCell>
                {branches.map((b) => {
                  const k = key(v.id, b.id);
                  const stock = v.stocks[b.id] ?? 0;
                  const min = parseLocaleNumber(values[k] || "0") ?? 0;
                  return (
                    <TableCell key={b.id}>
                      <div className="flex items-center justify-center gap-2">
                        <span className={`w-10 text-right tabular-nums ${min > 0 && stock < min ? "font-semibold text-destructive" : ""}`}>{show(stock)}</span>
                        <Input
                          aria-label={`Mínimo ${v.label} en ${b.name}`}
                          className="h-8 w-20 text-right"
                          inputMode="decimal"
                          value={values[k]}
                          disabled={!canWrite}
                          onChange={(e) => setValues((cur) => ({ ...cur, [k]: e.target.value }))}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <StatusMessage status={status} />
      {canWrite && (
        <Button className="w-fit" disabled={pending || changed.length === 0} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar mínimos{changed.length ? ` (${changed.length})` : ""}
        </Button>
      )}
    </div>
  );
}
