import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { formatNumber } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { BRANCH_ORDER } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Reposición de stock" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ local?: string }> };

/** Talles que quedaron por debajo del stock mínimo de su local, con lo que hay en otros locales y en producción. */
export default async function RestockPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.mastersRead);
  const { local } = await searchParams;
  const branches = await db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER, select: { id: true, name: true } });
  const branch = branches.find((b) => b.id === local) ?? null;

  const below = (
    await db.branchStock.findMany({
      where: { minQty: { gt: 0 }, branch: { active: true }, variant: { active: true, product: { active: true } }, ...(branch ? { branchId: branch.id } : {}) },
      include: {
        branch: { select: { name: true } },
        variant: { select: { id: true, size: true, color: true, fabric: true, sku: true, productId: true, product: { select: { name: true } }, branchStocks: { select: { branchId: true, quantity: true } } } },
      },
    })
  ).filter((s) => s.quantity.lt(s.minQty));

  // Lo que ya está en producción para stock (órdenes abiertas sin cliente).
  const inProduction = new Map(
    (
      await db.productionOrderItem.findMany({
        where: { variantId: { in: below.map((s) => s.variantId) }, productionOrder: { status: { in: ["BORRADOR", "EN_PROCESO"] }, clientId: null } },
        select: { variantId: true, quantity: true, quantityFinished: true },
      })
    ).reduce((m, i) => m.set(i.variantId, (m.get(i.variantId) ?? 0) + Math.max(0, i.quantity - i.quantityFinished)), new Map<string, number>()),
  );

  const rows = below
    .map((s) => {
      const others = s.variant.branchStocks
        .filter((o) => o.branchId !== s.branchId && o.quantity.gt(0))
        .map((o) => ({ name: branches.find((b) => b.id === o.branchId)?.name ?? "", qty: o.quantity.toNumber() }))
        .filter((o) => o.name);
      return { s, missing: s.minQty.minus(s.quantity).toNumber(), others, producing: inProduction.get(s.variantId) ?? 0 };
    })
    .sort(
      (a, b) =>
        a.s.branch.name.localeCompare(b.s.branch.name, "es") ||
        a.s.variant.product.name.localeCompare(b.s.variant.product.name, "es") ||
        (a.s.variant.color ?? "").localeCompare(b.s.variant.color ?? "", "es") ||
        compareSizes(a.s.variant.size, b.s.variant.size),
    );
  const totalMissing = rows.reduce((a, r) => a + r.missing, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/maestros/stock" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Stock por local
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Reposición</h1>
        <p className="text-sm text-muted-foreground">
          Talles con stock por debajo del mínimo de su local. Los mínimos se cargan en Stock por local, eligiendo el producto. Si otro local tiene, conviene transferir; si no, lanzar
          una orden de producción.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action="/maestros/stock/reposicion" className="flex flex-wrap gap-2">
            <div className="w-60">
            <NativeSelect name="local" defaultValue={branch?.id ?? ""} aria-label="Local">
              <option value="">Todos los locales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
            </div>
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} talle{rows.length === 1 ? "" : "s"} para reponer · faltan {formatNumber(totalMissing)} unidades
          </CardTitle>
          <CardDescription>&quot;En producción&quot; son las unidades de órdenes abiertas para stock que todavía no ingresaron.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todo en orden: ningún talle está por debajo de su mínimo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Local</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Faltan</TableHead>
                  <TableHead className="text-right">En producción</TableHead>
                  <TableHead>Hay en otros locales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ s, missing, others, producing }) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.branch.name}</TableCell>
                    <TableCell>
                      <Link href={`/maestros/stock?producto=${s.variant.productId}`} className="block underline-offset-2 hover:underline">
                        {s.variant.product.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        T.{s.variant.size}
                        {variantAttrs(s.variant) ? ` · ${variantAttrs(s.variant)}` : ""} · {s.variant.sku}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${s.quantity.lte(0) ? "font-semibold text-destructive" : ""}`}>{formatNumber(s.quantity.toNumber())}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.minQty.toNumber())}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatNumber(missing)}</TableCell>
                    <TableCell className="text-right tabular-nums">{producing ? formatNumber(producing) : "—"}</TableCell>
                    <TableCell className="text-sm">{others.length ? others.map((o) => `${o.name}: ${formatNumber(o.qty)}`).join(" · ") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
