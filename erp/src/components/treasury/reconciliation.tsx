"use client";

import { CheckCheck, FileUp, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirmReconciliationAction, previewReconciliationAction } from "@/server/actions/finance.actions";

type Preview = Extract<Awaited<ReturnType<typeof previewReconciliationAction>>, { ok: true }>["data"];
const d = (iso: string) => iso.split("-").reverse().join("/");

export function Reconciliation({ registers }: { registers: { id: string; name: string }[] }) {
  const id = useId();
  const [registerId, setRegisterId] = useState(registers[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipMatch, setSkipMatch] = useState<Set<number>>(new Set());
  const [create, setCreate] = useState<Record<number, { on: boolean; categoryId: string }>>({});
  const read = useServerAction();
  const save = useServerAction();

  function load() {
    if (!file) return;
    const form = new FormData();
    form.set("registerId", registerId);
    form.set("file", file);
    read.execute(
      () => previewReconciliationAction(form),
      (p) => {
        setPreview(p);
        setSkipMatch(new Set());
        setCreate(Object.fromEntries(p.unmatchedLines.map((l) => [l.row, { on: true, categoryId: p.suggestions[l.row] ?? "" }])));
      },
    );
  }

  function confirm() {
    if (!preview) return;
    save.execute(
      () =>
        confirmReconciliationAction({
          registerId: preview.register.id,
          matches: preview.matches.filter((m) => !skipMatch.has(m.line.row)).map((m) => ({ movementId: m.movement.id, row: m.line.row, description: m.line.description })),
          creates: preview.unmatchedLines
            .filter((l) => create[l.row]?.on)
            .map((l) => ({ row: l.row, date: l.date, amount: l.amount, description: l.description, categoryId: l.amount < 0 ? create[l.row]?.categoryId || null : null })),
        }),
      () => setPreview(null),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Extracto</CardTitle>
          <CardDescription>Descargá el extracto del home banking o el reporte de movimientos de Mercado Pago (Excel .xlsx o CSV) y subilo acá.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex w-64 flex-col gap-1.5">
            <Label htmlFor={`${id}-r`}>Cuenta</Label>
            <NativeSelect id={`${id}-r`} value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              {registers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-f`}>Archivo</Label>
            <input id={`${id}-f`} type="file" accept=".xlsx,.csv,.txt" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button type="button" disabled={!file || !registerId || read.pending} onClick={load}>
            {read.pending ? <Loader2 className="animate-spin" /> : <FileUp />} Leer y comparar
          </Button>
          <StatusMessage status={read.status} className="basis-full" />
          <StatusMessage status={save.status} className="basis-full" />
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Coinciden ({preview.matches.length})</CardTitle>
              <CardDescription>Mismo importe y fecha cercana. Se marcan como conciliados.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Extracto</TableHead>
                    <TableHead>En el sistema</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.matches.map((m) => (
                    <TableRow key={m.line.row} className={cn(skipMatch.has(m.line.row) && "opacity-50")}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4"
                          aria-label={`Conciliar fila ${m.line.row}`}
                          checked={!skipMatch.has(m.line.row)}
                          onChange={() =>
                            setSkipMatch((s) => {
                              const n = new Set(s);
                              if (n.has(m.line.row)) n.delete(m.line.row);
                              else n.add(m.line.row);
                              return n;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {d(m.line.date)} · {m.line.description}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {d(m.movement.date)} · {m.movement.concept}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", m.line.amount < 0 && "text-destructive")}>{formatMoney(m.line.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Solo en el extracto ({preview.unmatchedLines.length})</CardTitle>
              <CardDescription>Comisiones, impuestos, transferencias recibidas que no se cargaron… Marcadas: se registran en la cuenta con su fecha (y categoría si es un gasto).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Categoría de gasto</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.unmatchedLines.map((l) => (
                    <TableRow key={l.row} className={cn(!create[l.row]?.on && "opacity-50")}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4"
                          aria-label={`Registrar fila ${l.row}`}
                          checked={!!create[l.row]?.on}
                          onChange={(e) => setCreate((c) => ({ ...c, [l.row]: { categoryId: c[l.row]?.categoryId ?? "", on: e.target.checked } }))}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{d(l.date)}</TableCell>
                      <TableCell>{l.description}</TableCell>
                      <TableCell>
                        {l.amount < 0 ? (
                          <NativeSelect
                            aria-label={`Categoría fila ${l.row}`}
                            value={create[l.row]?.categoryId ?? ""}
                            onChange={(e) => setCreate((c) => ({ ...c, [l.row]: { on: c[l.row]?.on ?? true, categoryId: e.target.value } }))}
                          >
                            <option value="">No es un gasto (pago, transferencia…)</option>
                            {preview.categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </NativeSelect>
                        ) : (
                          <span className="text-xs text-muted-foreground">Ingreso</span>
                        )}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", l.amount < 0 && "text-destructive")}>{formatMoney(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {preview.unmatchedMovements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Solo en el sistema ({preview.unmatchedMovements.length})</CardTitle>
                <CardDescription>Movimientos cargados que no aparecen en el extracto: pueden estar en el próximo extracto o haberse cargado por error. Revisalos.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {preview.unmatchedMovements.map((m) => (
                  <div key={m.id} className="flex justify-between gap-2">
                    <span>
                      {d(m.date)} · {m.concept}
                    </span>
                    <span className={cn("font-mono", m.amount < 0 && "text-destructive")}>{formatMoney(m.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Button className="w-fit" disabled={save.pending} onClick={confirm}>
            {save.pending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Confirmar conciliación de {preview.register.name}
          </Button>
        </>
      )}
    </div>
  );
}
