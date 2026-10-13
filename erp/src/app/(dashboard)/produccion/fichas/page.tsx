import type { Metadata } from "next";

import { ProductCostTable } from "@/components/production/product-cost-table";
import { listProductsWithCost } from "@/server/queries/production.queries";

export const metadata: Metadata = { title: "Fichas técnicas" };
export const dynamic = "force-dynamic";

export default async function FichasPage() {
  const products = await listProductsWithCost();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Fichas técnicas y escandallos</h1>
        <p className="text-sm text-muted-foreground">
          Costo por prenda calculado con precios de reposición vigentes. Abrí una prenda para editar su ficha o simular costos.
        </p>
      </div>
      <ProductCostTable data={products} />
    </div>
  );
}
