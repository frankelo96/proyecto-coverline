"use client";

import { DownloadCloud, Loader2, PlugZap, RefreshCw, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatNumber } from "@/lib/format";
import { importWooCatalogAction, runWooSyncAction, testWooConnectionAction } from "@/server/actions/woo.actions";
import type { SyncSummary } from "@/server/woo/sync";

export function WooControls({ mode }: { mode: string }) {
  const { pending, status, execute } = useServerAction();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const readOnly = mode !== "activo";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => execute(() => testWooConnectionAction())}>
          <PlugZap /> Probar conexión
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => execute(() => importWooCatalogAction())}>
          <DownloadCloud /> Traer productos de la tienda
        </Button>
        <Button disabled={pending} onClick={() => execute(() => runWooSyncAction(false), (d) => setSummary(d))}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {readOnly ? "Ver qué se sincronizaría" : "Sincronizar ahora"}
        </Button>
        {!readOnly && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => window.confirm("¿Reenviar el stock de todos los artículos vinculados a la tienda?") && execute(() => runWooSyncAction(true), (d) => setSummary(d))}
          >
            <Send /> Reenviar todo el stock
          </Button>
        )}
      </div>
      <StatusMessage status={status} />
      {summary && (
        <div className="flex flex-col gap-3 rounded-md border p-4 text-sm">
          <p>
            Pedidos web leídos: <strong>{summary.orders.seen}</strong>
            {summary.mode === "activo" && (
              <>
                {" "}
                · descontados <strong>{summary.orders.deducted}</strong> · devueltos <strong>{summary.orders.restocked}</strong>
                {summary.orders.baseline > 0 && <> · {summary.orders.baseline} completados anteriores registrados sin descontar</>}
              </>
            )}
          </p>
          {summary.orders.unmatchedLines.length > 0 && (
            <details>
              <summary className="cursor-pointer text-destructive">{summary.orders.unmatchedLines.length} renglones de pedidos sin vincular (no descuentan stock)</summary>
              <ul className="mt-2 list-inside list-disc text-xs">
                {summary.orders.unmatchedLines.slice(0, 50).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          )}
          {summary.push.errors.length > 0 && <p className="text-destructive">{summary.push.errors.join(" · ")}</p>}
          {summary.push.preview.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-3">Artículo en la web</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Stock total ERP</TableHead>
                    <TableHead className="text-right">Publicado antes</TableHead>
                    <TableHead className="pr-3 text-right">{summary.mode === "activo" ? "Publicado ahora" : "Se publicaría"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.push.preview.map((p) => (
                    <TableRow key={p.sku}>
                      <TableCell className="pl-3">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="text-right">{formatNumber(p.total)}</TableCell>
                      <TableCell className="text-right">{p.before ?? "—"}</TableCell>
                      <TableCell className="pr-3 text-right font-semibold">{p.web}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
