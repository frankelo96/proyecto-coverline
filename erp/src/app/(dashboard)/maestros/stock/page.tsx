import type { Metadata } from "next";

import { StockTransfer } from "@/components/masters/stock-transfer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Stock por local" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ producto?: string }> };

export default async function StockByBranchPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.mastersRead);
  const { producto } = await searchParams;
  const [branches, products] = await Promise.all([
    db.branch.findMany({ where: { active: true }, orderBy: [{ pointOfSale: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true, name: true } }),
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
  ]);
  const selected = products.find((p) => p.id === producto) ?? null;
  const variants = selected
    ? (await db.productVariant.findMany({ where: { productId: selected.id, active: true }, include: { branchStocks: true } })).sort(
        (a, b) => (a.color ?? "").localeCompare(b.color ?? "", "es") || (a.fabric ?? "").localeCompare(b.fabric ?? "", "es") || compareSizes(a.size, b.size),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Stock por local</h1>
        <p className="text-sm text-muted-foreground">
          Cada local vende de su propio stock. Las compras y la producción terminada ingresan a {branches[0]?.name ?? "el local principal"}; desde acá se reparte a los demás.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Elegí un producto</CardTitle>
          <CardDescription>Se muestran sus variantes con el stock de cada local.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/maestros/stock" className="flex flex-wrap gap-2">
            <div className="min-w-72 flex-1">
              <NativeSelect name="producto" defaultValue={selected?.id ?? ""} aria-label="Producto">
                <option value="" disabled>
                  Elegí el producto…
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" variant="secondary">
              Ver stock
            </Button>
          </form>
        </CardContent>
      </Card>
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <StockTransfer
              key={selected.id + variants.map((v) => v.branchStocks.map((s) => s.quantity.toString()).join(",")).join("|")}
              branches={branches}
              canWrite={hasPermission(user.permissions, PERMISSIONS.mastersWrite)}
              variants={variants.map((v) => ({
                id: v.id,
                sku: v.sku,
                label: `T.${v.size}${variantAttrs(v) ? ` · ${variantAttrs(v)}` : ""}`,
                stocks: Object.fromEntries(v.branchStocks.map((s) => [s.branchId, s.quantity.toNumber()])),
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
