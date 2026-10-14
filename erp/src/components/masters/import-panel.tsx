"use client";

import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionStatus } from "@/hooks/use-server-action";
import type { EntityKey } from "@/lib/masters/definitions";
import { importMasterAction } from "@/server/actions/masters.actions";
import type { ImportOutcome, ImportPreview } from "@/server/masters/service";

const PREVIEW_LIMIT = 300;

export function ImportPanel({ entity, title, basePath, matchHelp }: { entity: EntityKey; title: string; basePath: string; matchHelp: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [status, setStatus] = useState<ActionStatus>(null);
  const [pending, startTransition] = useTransition();
  const [onlyErrors, setOnlyErrors] = useState(false);

  function run(selected: File, commit: boolean) {
    setStatus(null);
    const fd = new FormData();
    fd.set("entity", entity);
    fd.set("file", selected);
    if (commit) fd.set("commit", "1");
    startTransition(async () => {
      const r = await importMasterAction(fd);
      if (!r.ok) {
        setStatus({ kind: "error", text: r.error });
        return;
      }
      if ("preview" in r.data) {
        setPreview(r.data.preview);
        setOutcome(null);
      } else {
        setOutcome(r.data.outcome);
        setPreview(null);
        setStatus({ kind: r.data.outcome.failed.length ? "error" : "success", text: r.message ?? "Importación terminada" });
      }
    });
  }

  function onFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setOutcome(null);
    if (f) run(f, false);
    // Permite volver a elegir el mismo archivo después de corregirlo.
    else if (inputRef.current) inputRef.current.value = "";
  }

  const valid = preview ? preview.toCreate + preview.toUpdate : 0;
  const rows = preview ? (onlyErrors ? preview.rows.filter((r) => r.action === "ERROR") : preview.rows).slice(0, PREVIEW_LIMIT) : [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Prepará la planilla</CardTitle>
          <CardDescription>
            Bajá la plantilla (o exportá lo que ya está cargado), completala en Excel o Google Sheets y subila como .xlsx o .csv. {matchHelp}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/exportar/${entity}?plantilla=1`}>
              <FileSpreadsheet /> Plantilla Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/exportar/${entity}`}>
              <FileSpreadsheet /> Exportar lo cargado actualmente
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Subí el archivo</CardTitle>
          <CardDescription>Primero se muestra una vista previa: nada se guarda hasta que confirmes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label
            htmlFor={`${id}-file`}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input px-6 py-8 text-center text-sm hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files[0] ?? null);
            }}
          >
            <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
            <span className="font-medium">{file ? file.name : "Elegí o arrastrá un archivo .xlsx o .csv"}</span>
            <span className="text-xs text-muted-foreground">Hasta 5 MB y 5.000 filas</span>
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Procesando…
            </p>
          )}
          <StatusMessage status={status} />
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>3. Revisá y confirmá</CardTitle>
            <CardDescription>
              {preview.total} filas: <strong className="text-foreground">{preview.toCreate}</strong> nuevas,{" "}
              <strong className="text-foreground">{preview.toUpdate}</strong> actualizaciones,{" "}
              <strong className={preview.withErrors ? "text-destructive" : "text-foreground"}>{preview.withErrors}</strong> con errores (se omiten).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5 text-xs" aria-label="Columnas reconocidas">
              {preview.columns
                .filter((c) => c.header.trim())
                .map((c, i) => (
                  <Badge key={i} variant={c.field ? "success" : "outline"} title={c.field ? `→ ${c.field}` : "Columna ignorada"}>
                    {c.header}
                    {!c.field && " (ignorada)"}
                  </Badge>
                ))}
            </div>
            {preview.missingRequired.length > 0 && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                Faltan columnas obligatorias: {preview.missingRequired.join(", ")}. Revisá los encabezados o usá la plantilla.
              </p>
            )}
            {preview.withErrors > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
                Ver solo filas con errores
              </label>
            )}
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 pl-4">Fila</TableHead>
                    <TableHead className="w-32">Acción</TableHead>
                    <TableHead>Registro / problema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="pl-4 font-mono text-xs">{r.line}</TableCell>
                      <TableCell>
                        <Badge variant={r.action === "ERROR" ? "destructive" : r.action === "CREAR" ? "success" : "default"}>
                          {r.action === "ERROR" ? "Error" : r.action === "CREAR" ? "Nuevo" : "Actualiza"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.label}
                        {r.errors.length > 0 && <span className="block text-destructive">{r.errors.join(" · ")}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.total > PREVIEW_LIMIT && <p className="text-xs text-muted-foreground">Se muestran las primeras {PREVIEW_LIMIT} filas.</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => onFile(null)} disabled={pending}>
                Descartar
              </Button>
              <Button onClick={() => file && run(file, true)} disabled={pending || valid === 0}>
                {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Importar {valid} filas válidas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {outcome && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
            <CardDescription>
              {outcome.created} nuevos · {outcome.updated} actualizados · {outcome.failed.length} con error
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {outcome.failed.length > 0 && (
              <ul className="max-h-64 list-inside list-disc overflow-auto text-sm text-destructive">
                {outcome.failed.map((f) => (
                  <li key={f.line}>
                    Fila {f.line}: {f.error}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Button asChild>
                <Link href={basePath}>Ver {title.toLowerCase()}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
