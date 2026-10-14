"use client";

import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatNumber } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { webQuantity } from "@/lib/woo/stock";
import { transferStockAction } from "@/server/actions/catalog.actions";

export interface TransferVariant {
  id: string;
  sku: string;
  label: string;
  stocks: Record<string, number>;
}

/** Stock de cada variante por local y transferencia de un local a otro. */
export function StockTransfer({
  branches,
  variants,
  canWrite,
  webSafety,
}: {
  branches: { id: string; name: string; kind: "LOCAL" | "MAYORISTA" }[];
  variants: TransferVariant[];
  canWrite: boolean;
  webSafety: number;
}) {
  const uid = useId();
  const [from, setFrom] = useState(branches[0]?.id ?? "");
  const [to, setTo] = useState(branches[1]?.id ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const { pending, status, execute } = useServerAction();
  const lines = variants.map((v) => ({ variantId: v.id, quantity: parseLocaleNumber(qty[v.id] || "0") ?? 0 })).filter((l) => l.quantity > 0);
  const units = lines.reduce((a, l) => a + l.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="grid gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_2fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-from`}>Desde</Label>
            <NativeSelect id={`${uid}-from`} value={from} onChange={(e) => setFrom(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-to`}>Hacia</Label>
            <NativeSelect id={`${uid}-to`} value={to} onChange={(e) => setTo(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-notes`}>Observaciones</Label>
            <Input id={`${uid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. reposición Villa Allende" />
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3">Variante</TableHead>
              {branches.map((b) => (
                <TableHead key={b.id} className="text-right">
                  {b.name}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right" title={`Stock de los locales (sin mayorista) menos ${webSafety} de margen`}>
                Web
              </TableHead>
              {canWrite && <TableHead className="w-28 pr-3 text-right">A transferir</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="pl-3">
                  {v.label}
                  <span className="block font-mono text-xs text-muted-foreground">{v.sku}</span>
                </TableCell>
                {branches.map((b) => (
                  <TableCell key={b.id} className={`text-right font-mono tabular-nums ${(v.stocks[b.id] ?? 0) < 0 ? "text-destructive" : ""}`}>
                    {formatNumber(v.stocks[b.id] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-mono font-semibold tabular-nums">{formatNumber(branches.reduce((a, b) => a + (v.stocks[b.id] ?? 0), 0))}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                  {formatNumber(webQuantity(branches.filter((b) => b.kind === "LOCAL").reduce((a, b) => a + (v.stocks[b.id] ?? 0), 0), webSafety))}
                </TableCell>
                {canWrite && (
                  <TableCell className="pr-3">
                    <Input
                      aria-label={`Cantidad a transferir de ${v.label}`}
                      inputMode="decimal"
                      value={qty[v.id] ?? ""}
                      onChange={(e) => setQty({ ...qty, [v.id]: e.target.value })}
                      className="h-8 text-right"
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <StatusMessage status={status} />
      {canWrite && (
        <div className="flex justify-end">
          <Button
            disabled={pending || units === 0 || from === to}
            onClick={() => execute(() => transferStockAction({ fromBranchId: from, toBranchId: to, lines, notes: notes || null }), () => setQty({}))}
          >
            {pending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Transferir {units > 0 ? `${formatNumber(units)} unidades` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
