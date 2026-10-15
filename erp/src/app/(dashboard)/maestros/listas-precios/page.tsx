import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PriceListEditor } from "@/components/masters/price-list-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Listas de precios" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ lista?: string }> };

/** Listas de precios (mayorista, colegios, empresas…) que se asignan a cada cliente. */
export default async function PriceListsPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.mastersRead);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.mastersWrite);
  const { lista } = await searchParams;
  const lists = await db.priceList.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { clients: true, items: true } } } });
  const isNew = lista === "nueva";
  const selected = isNew ? null : (lists.find((l) => l.id === lista) ?? lists[0] ?? null);
  const [items, products] = selected
    ? await Promise.all([
        db.priceListItem.findMany({ where: { priceListId: selected.id }, select: { productId: true, netPrice: true } }),
        db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, listPrice: true, vatRate: true } }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Listas de precios</h1>
          <p className="text-sm text-muted-foreground">
            Cada cliente puede tener una lista (se elige en su ficha). En el POS y en los presupuestos se aplica sola; sin lista se cobra el precio minorista.
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/maestros/listas-precios?lista=nueva">
              <Plus /> Nueva lista
            </Link>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_240px]">
          <CardContent className="flex flex-col gap-1 pt-6">
            {lists.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay listas.</p>}
            {lists.map((l) => (
              <Link
                key={l.id}
                href={`/maestros/listas-precios?lista=${l.id}`}
                className={cn("flex flex-col rounded-md px-3 py-2 text-sm hover:bg-muted", selected?.id === l.id && "bg-muted font-medium")}
              >
                <span className="flex items-center justify-between gap-2">
                  {l.name}
                  {!l.active && <Badge variant="outline">Inactiva</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {l.adjustmentPct.isZero() ? "Sin ajuste" : `${l.adjustmentPct.gt(0) ? "+" : ""}${formatNumber(l.adjustmentPct.toNumber())}%`} · {l._count.items} precios fijos · {l._count.clients} clientes
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0 flex-[999_1_560px]">
          <CardHeader>
            <CardTitle>{isNew ? "Nueva lista" : (selected?.name ?? "Elegí o creá una lista")}</CardTitle>
            {selected && <CardDescription>{selected._count.clients} clientes con esta lista.</CardDescription>}
          </CardHeader>
          <CardContent>
            {(isNew || selected) && (
              <PriceListEditor
                key={selected?.id ?? "nueva"}
                canWrite={canWrite}
                list={
                  selected
                    ? {
                        id: selected.id,
                        name: selected.name,
                        adjustmentPct: selected.adjustmentPct.toNumber(),
                        notes: selected.notes,
                        active: selected.active,
                        prices: Object.fromEntries(items.map((i) => [i.productId, i.netPrice.toNumber()])),
                      }
                    : { id: null, name: "", adjustmentPct: 0, notes: null, active: true, prices: {} }
                }
                products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, listPrice: p.listPrice.toNumber(), vatRate: p.vatRate.toNumber() }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
