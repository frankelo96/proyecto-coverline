import { Download, FileSpreadsheet, Plus, Search, Upload } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENTITIES, type EntityKey } from "@/lib/masters/definitions";
import { formatField } from "@/lib/masters/fields";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ADAPTERS } from "@/server/masters/adapters";

const MONEY_KEYS = new Set(["listPrice", "currentCost", "creditLimit"]);

export interface MasterListProps {
  entity: EntityKey;
  q?: string;
  inactive?: boolean;
  canWrite: boolean;
  aviso?: string;
  /** Link de cada fila (por defecto, la ficha de edición) */
  rowHref?: (id: string) => string;
  description?: React.ReactNode;
}

export async function MasterList({ entity, q, inactive, canWrite, aviso, rowHref, description }: MasterListProps) {
  const def = ENTITIES[entity];
  const adapter = ADAPTERS[entity];
  const query = q?.trim() || null;
  const [rows, refs] = await Promise.all([adapter.list(query, !!inactive), adapter.refs()]);
  const columns = def.listColumns.map((k) => def.fields.find((f) => f.key === k)!);
  const extra = adapter.extraColumns ?? [];
  const href = rowHref ?? ((id: string) => `${def.basePath}/${id}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">{def.title}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? def.singular : def.title.toLowerCase()}
            {query ? ` que coinciden con “${query}”` : ""}
            {description ? <> · {description}</> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exportar/${entity}`} title="Exportar a Excel (se puede editar y volver a importar)">
              <FileSpreadsheet /> Excel
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/exportar/${entity}?formato=csv`}>
              <Download /> CSV
            </a>
          </Button>
          {canWrite && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`${def.basePath}/importar`}>
                  <Upload /> Importar
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`${def.basePath}/nuevo`}>
                  <Plus /> {def.newLabel}
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <FlashNotice message={aviso} />

      <form role="search" className="flex flex-wrap items-center gap-3" action={def.basePath}>
        <div className="relative w-full max-w-md">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={q ?? ""} placeholder="Buscar…" aria-label={`Buscar ${def.title.toLowerCase()}`} className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactivos" value="1" defaultChecked={inactive} className="size-4 accent-primary" />
          Incluir inactivos
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Buscar
        </Button>
        {(query || inactive) && (
          <Link href={def.basePath} className="text-sm underline underline-offset-4">
            Limpiar
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c, i) => (
                <TableHead key={c.key} className={cn(i === 0 && "pl-5", (c.type === "number" || c.type === "int") && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
              {extra.map((c) => (
                <TableHead key={c.key} className={cn((c.money || c.numeric) && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="pr-5">
                <span className="sr-only">Estado</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length + extra.length + 1} className="py-12 text-center text-muted-foreground">
                  {query ? "Sin resultados para esa búsqueda." : `Todavía no hay ${def.title.toLowerCase()} cargados.`}
                  {canWrite && !query && (
                    <span className="mt-3 flex justify-center gap-2">
                      <Button asChild size="sm">
                        <Link href={`${def.basePath}/nuevo`}>
                          <Plus /> {def.newLabel}
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`${def.basePath}/importar`}>
                          <Upload /> Importar desde Excel
                        </Link>
                      </Button>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(!r.active && "text-muted-foreground")}>
                {columns.map((c, i) => {
                  const raw = r.values[c.key];
                  const numeric = c.type === "number" || c.type === "int";
                  const text = MONEY_KEYS.has(c.key) ? formatMoney(Number(raw ?? 0)) : numeric ? formatNumber(Number(raw ?? 0)) : formatField(c, raw ?? null, refs);
                  return (
                    <TableCell key={c.key} className={cn(i === 0 && "pl-5", numeric && "text-right font-mono tabular-nums")}>
                      {i === 0 ? (
                        <Link href={href(r.id)} className="font-medium underline-offset-4 hover:underline">
                          {text || "—"}
                        </Link>
                      ) : (
                        (text ?? "—")
                      )}
                    </TableCell>
                  );
                })}
                {extra.map((c) => {
                  const v = r.extra?.[c.key] ?? null;
                  return (
                    <TableCell key={c.key} className={cn((c.money || c.numeric) && "text-right font-mono tabular-nums")}>
                      {v === null ? "—" : c.money ? (Number(v) === 0 ? "—" : formatMoney(Number(v))) : c.numeric ? formatNumber(Number(v)) : v}
                    </TableCell>
                  );
                })}
                <TableCell className="pr-5">
                  {!r.active && <Badge variant="outline">Inactivo</Badge>}
                  {r.extra?.low && <Badge variant="destructive">{r.extra.low}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length === 500 && <p className="text-xs text-muted-foreground">Se muestran los primeros 500 resultados: usá la búsqueda para encontrar el resto.</p>}
    </div>
  );
}
