"use client";

import { Loader2, Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { normalizeEan13 } from "@/lib/catalog/barcode";
import type { ScanMode } from "@/lib/validations/catalog";
import { cn } from "@/lib/utils";
import { scanStockAction } from "@/server/actions/catalog.actions";

export interface ScanVariant {
  id: string;
  label: string;
  sku: string;
  barcode: string | null;
  stocks: Record<string, number>;
}

const MODES: { key: ScanMode; label: string; help: string }[] = [
  { key: "INGRESO", label: "Ingreso (+)", help: "Suma al stock del local: mercadería que llega de producción, compras o devoluciones." },
  { key: "EGRESO", label: "Egreso (−)", help: "Resta del stock del local: fallas, roturas, muestras, regalos." },
  { key: "CONTEO", label: "Conteo de inventario", help: "Escaneá todo lo que hay en el local: el stock de cada artículo escaneado pasa a ser lo contado." },
  { key: "TRANSFERENCIA", label: "Transferencia", help: "Pasa lo escaneado de un local a otro (o al mayorista)." },
];

/** Un pitido corto cuando el código no se encuentra (el lector no siempre da aviso). */
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 220;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {
    // Sin audio: alcanza con el mensaje.
  }
}

/**
 * Carga de stock con lector de códigos de barras: cada lectura suma 1 al
 * artículo (el lector "tipea" el código y Enter). Al confirmar se aplica todo junto.
 */
export function StockScanner({ variants, branches }: { variants: ScanVariant[]; branches: { id: string; name: string }[] }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ScanMode>("INGRESO");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [toBranchId, setToBranchId] = useState(branches[1]?.id ?? "");
  const [code, setCode] = useState("");
  const [lines, setLines] = useState<{ variantId: string; qty: number }[]>([]);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState("");
  const { pending, status, execute } = useServerAction();

  const index = useMemo(() => {
    const m = new Map<string, ScanVariant>();
    for (const v of variants) {
      m.set(v.sku.toUpperCase(), v);
      if (v.barcode) {
        m.set(v.barcode, v);
        const ean = normalizeEan13(v.barcode);
        if (ean) m.set(ean, v);
      }
    }
    return m;
  }, [variants]);
  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);

  function scan(raw: string) {
    const c = raw.trim();
    if (!c) return;
    const v = index.get(c) ?? index.get(c.toUpperCase()) ?? (normalizeEan13(c) ? index.get(normalizeEan13(c)!) : undefined);
    if (!v) {
      beep();
      setLast({ ok: false, text: `Código ${c} no encontrado` });
      return;
    }
    setLines((prev) => {
      const found = prev.find((l) => l.variantId === v.id);
      const rest = prev.filter((l) => l.variantId !== v.id);
      return [{ variantId: v.id, qty: (found?.qty ?? 0) + 1 }, ...rest];
    });
    setLast({ ok: true, text: v.label });
  }

  const setQty = (variantId: string, qty: number) => setLines((prev) => (qty <= 0 ? prev.filter((l) => l.variantId !== variantId) : prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l))));
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const help = MODES.find((m) => m.key === mode)!.help;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-mode`}>Movimiento</Label>
          <NativeSelect id={`${id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as ScanMode)}>
            {MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-branch`}>{mode === "TRANSFERENCIA" ? "Desde" : "Local"}</Label>
          <NativeSelect id={`${id}-branch`} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {mode === "TRANSFERENCIA" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-to`}>Hacia</Label>
            <NativeSelect id={`${id}-to`} value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{help}</p>

      <div className="relative">
        <ScanBarcode aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          autoFocus
          aria-label="Escanear código"
          placeholder="Escaneá el código de barras (o escribí el código o SKU y Enter)"
          className="h-12 pl-11 font-mono text-base"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            scan(code);
            setCode("");
          }}
        />
      </div>
      {last && (
        <p role="status" className={cn("rounded-md px-3 py-2 text-sm font-medium", last.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {last.ok ? `+1 ${last.text}` : last.text}
        </p>
      )}

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Artículo</TableHead>
                <TableHead className="text-right">Stock actual</TableHead>
                <TableHead className="text-center">{mode === "CONTEO" ? "Contado" : "Cantidad"}</TableHead>
                <TableHead className="pr-3 text-right">{mode === "CONTEO" ? "Diferencia" : "Queda"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const v = byId.get(l.variantId)!;
                const current = v.stocks[branchId] ?? 0;
                const after = mode === "CONTEO" ? l.qty : mode === "INGRESO" ? current + l.qty : current - l.qty;
                const diff = l.qty - current;
                return (
                  <TableRow key={l.variantId}>
                    <TableCell className="pl-3">
                      {v.label}
                      <span className="block font-mono text-xs text-muted-foreground">
                        {v.sku} · {v.barcode}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{current}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button type="button" variant="ghost" size="icon" aria-label="Uno menos" onClick={() => setQty(l.variantId, l.qty - 1)}>
                          <Minus />
                        </Button>
                        <Input
                          aria-label={`Cantidad de ${v.label}`}
                          inputMode="numeric"
                          className="h-8 w-16 text-center"
                          value={l.qty}
                          onChange={(e) => setQty(l.variantId, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
                        />
                        <Button type="button" variant="ghost" size="icon" aria-label="Uno más" onClick={() => setQty(l.variantId, l.qty + 1)}>
                          <Plus />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setQty(l.variantId, 0)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className={cn("pr-3 text-right font-mono tabular-nums", (mode === "CONTEO" ? diff !== 0 : after < 0) && "font-semibold text-destructive")}>
                      {mode === "CONTEO" ? (diff > 0 ? `+${diff}` : diff) : mode === "TRANSFERENCIA" ? current - l.qty : after}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-notes`}>Motivo / observaciones</Label>
        <Input id={`${id}-notes`} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. ingreso OP #12, conteo mensual, prenda fallada" />
      </div>
      <StatusMessage status={status} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || lines.length === 0}
          onClick={() =>
            execute(
              () =>
                scanStockAction({
                  mode,
                  branchId,
                  toBranchId: mode === "TRANSFERENCIA" ? toBranchId : null,
                  lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
                  notes: notes || null,
                }),
              () => {
                setLines([]);
                setNotes("");
                setLast(null);
                input.current?.focus();
              },
            )
          }
        >
          {pending && <Loader2 className="animate-spin" />} Confirmar {units} unidades
        </Button>
        {lines.length > 0 && (
          <Button variant="ghost" onClick={() => window.confirm("¿Descartar lo escaneado?") && setLines([])}>
            Descartar
          </Button>
        )}
      </div>
    </div>
  );
}
