import type { Metadata } from "next";

import { PriceUpdater } from "@/components/masters/price-updater";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CATEGORY_LABELS } from "@/lib/masters/labels";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Aumento de precios" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ rubro?: string; origen?: string; q?: string }> };

export default async function PriceUpdatePage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.mastersWrite);
  const sp = await searchParams;
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(sp.rubro && sp.rubro in CATEGORY_LABELS ? { category: sp.rubro as keyof typeof CATEGORY_LABELS } : {}),
    ...(sp.origen === "FABRICADO" || sp.origen === "REVENTA" ? { sourcing: sp.origen } : {}),
    ...(sp.q?.trim() ? { OR: [{ name: { contains: sp.q.trim(), mode: "insensitive" } }, { sku: { contains: sp.q.trim(), mode: "insensitive" } }] } : {}),
  };
  const products = await db.product.findMany({ where, orderBy: { name: "asc" } });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Aumento de precios</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Actualizá el precio de lista de muchos productos a la vez: un porcentaje o el precio sugerido por la ficha de costos, con redondeo del precio final. Las listas de precios con
          ajuste % se mueven solas; los precios fijos de una lista se actualizan en su pantalla. Queda registrado en la auditoría.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Qué productos</CardTitle>
          <CardDescription>{products.length} productos con estos filtros.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/maestros/precios" className="flex flex-wrap gap-2">
            <div className="w-52">
              <NativeSelect name="rubro" defaultValue={sp.rubro ?? ""} aria-label="Rubro">
                <option value="">Todos los rubros</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-52">
              <NativeSelect name="origen" defaultValue={sp.origen ?? ""} aria-label="Origen">
                <option value="">Fabricados y reventa</option>
                <option value="FABRICADO">Solo fabricación propia</option>
                <option value="REVENTA">Solo reventa</option>
              </NativeSelect>
            </div>
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre o SKU" className="w-56" aria-label="Buscar" />
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <PriceUpdater
            key={JSON.stringify(sp)}
            products={products.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              category: p.category,
              listPrice: p.listPrice.toNumber(),
              vatRate: p.vatRate.toNumber(),
              currentCost: p.currentCost.toNumber(),
              pricingMode: p.pricingMode,
              pricingPct: p.pricingPct.toNumber(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
