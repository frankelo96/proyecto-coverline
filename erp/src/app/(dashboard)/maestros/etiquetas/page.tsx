import type { Metadata } from "next";

import { LabelBuilder } from "@/components/catalog/label-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { decodeLabelItems } from "@/lib/catalog/labels";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { BRANCH_ORDER } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Etiquetas con código de barras" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ productos?: string; producto?: string; items?: string }> };

export default async function LabelsPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.mastersRead);
  const sp = await searchParams;
  const prefill = decodeLabelItems(sp.items);
  // Desde una orden de producción o compra llegan las variantes con su cantidad.
  const fromItems = prefill.length
    ? (await db.productVariant.findMany({ where: { id: { in: prefill.map((i) => i.variantId) } }, select: { productId: true } })).map((v) => v.productId)
    : [];
  const selected = [...new Set([...(sp.productos ?? sp.producto ?? "").split(",").filter(Boolean), ...fromItems])].slice(0, 20);
  const [products, branches, variants] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
    db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER, select: { id: true, name: true } }),
    selected.length
      ? db.productVariant.findMany({ where: { productId: { in: selected }, active: true }, include: { product: { select: { name: true } }, branchStocks: true } })
      : Promise.resolve([]),
  ]);
  const order = new Map(selected.map((id, i) => [id, i]));
  const rows = variants
    .sort(
      (a, b) =>
        (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0) ||
        (a.color ?? "").localeCompare(b.color ?? "", "es") ||
        (a.fabric ?? "").localeCompare(b.fabric ?? "", "es") ||
        compareSizes(a.size, b.size),
    )
    .map((v) => ({
      id: v.id,
      productId: v.productId,
      productName: v.product.name,
      label: `${v.product.name} · T.${v.size}${variantAttrs(v) ? ` · ${variantAttrs(v)}` : ""}`,
      sku: v.sku,
      barcode: v.barcode,
      stocks: Object.fromEntries(v.branchStocks.map((s) => [s.branchId, s.quantity.toNumber()])),
    }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Etiquetas con código de barras</h1>
        <p className="text-sm text-muted-foreground">
          Cada talle/color tiene su código (EAN-13). Al escanearlo en el punto de venta se agrega al ticket y descuenta stock; en Stock por local → Escanear se cargan ingresos,
          egresos y conteos.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Qué imprimir</CardTitle>
          <CardDescription>Elegí uno o varios productos y cuántas etiquetas de cada talle. Sirve para etiquetar lo que entra de producción o de compras.</CardDescription>
        </CardHeader>
        <CardContent>
          <LabelBuilder
            key={selected.join(",")}
            products={products}
            selected={selected}
            variants={rows}
            branches={branches}
            initialQty={Object.fromEntries(prefill.map((i) => [i.variantId, i.qty]))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
