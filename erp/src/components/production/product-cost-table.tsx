"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductCategory } from "@/generated/prisma/enums";
import { formatMoney, formatPct } from "@/lib/format";
import type { ProductCostRow } from "@/server/queries/production.queries";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  TRABAJO: "Trabajo",
  ESCOLAR: "Escolar",
  MEDICA: "Médica",
  GASTRONOMICA: "Gastronómica",
  ACCESORIO: "Accesorio",
};

/** Margen mínimo aceptable antes de marcar la prenda como en riesgo. */
const MARGIN_WARNING_PCT = 35;

const columns: ColumnDef<ProductCostRow>[] = [
  {
    accessorKey: "sku",
    header: "SKU",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
  },
  {
    accessorKey: "name",
    header: "Prenda",
    cell: ({ row }) => (
      <Link
        href={`/produccion/fichas/${row.original.id}`}
        className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "category",
    header: "Rubro",
    cell: ({ row }) => <Badge variant="outline">{CATEGORY_LABELS[row.original.category]}</Badge>,
    filterFn: "equalsString",
  },
  {
    accessorKey: "currentCost",
    header: "Costo",
    meta: { align: "right" },
    cell: ({ row }) => <span className="font-mono tabular-nums">{formatMoney(row.original.currentCost)}</span>,
  },
  {
    accessorKey: "listPrice",
    header: "Precio lista (neto)",
    meta: { align: "right" },
    cell: ({ row }) => <span className="font-mono tabular-nums">{formatMoney(row.original.listPrice)}</span>,
  },
  {
    accessorKey: "marginPct",
    header: "Margen",
    meta: { align: "right" },
    sortUndefined: "last",
    cell: ({ row }) => {
      const m = row.original.marginPct;
      if (m === null) return <span className="text-muted-foreground">Sin precio</span>;
      return (
        <Badge variant={m < 0 ? "destructive" : m < MARGIN_WARNING_PCT ? "accent" : "success"}>{formatPct(m)}</Badge>
      );
    },
  },
  {
    accessorKey: "costUpdatedAt",
    header: "Último cálculo",
    cell: ({ row }) =>
      row.original.costUpdatedAt ? (
        <time dateTime={row.original.costUpdatedAt} className="text-muted-foreground">
          {new Date(row.original.costUpdatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
        </time>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function ProductCostTable({ data }: { data: ProductCostRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [category, setCategory] = useState<ProductCategory | "">("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters: category ? [{ id: "category", value: category }] : [] },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por SKU o nombre"
            aria-label="Buscar prendas"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <div role="group" aria-label="Filtrar por rubro" className="flex flex-wrap gap-1.5">
          {(["", ...Object.keys(CATEGORY_LABELS)] as (ProductCategory | "")[]).map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={
                category === c
                  ? "h-10 rounded-md border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground"
                  : "h-10 rounded-md border border-input bg-card px-3 text-sm hover:bg-muted"
              }
            >
              {c ? CATEGORY_LABELS[c] : "Todos"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const right = (header.column.columnDef.meta as { align?: string } | undefined)?.align === "right";
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={right ? "text-right" : undefined}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`inline-flex min-h-10 items-center gap-1 hover:text-foreground ${right ? "flex-row-reverse" : ""}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp aria-hidden="true" className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  No hay prendas que coincidan.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const right = (cell.column.columnDef.meta as { align?: string } | undefined)?.align === "right";
                    return (
                      <TableCell key={cell.id} className={right ? "text-right" : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
