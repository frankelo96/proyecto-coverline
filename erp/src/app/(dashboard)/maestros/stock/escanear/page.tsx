import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StockScanner } from "@/components/catalog/stock-scanner";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { variantAttrs } from "@/lib/catalog/variants";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { BRANCH_ORDER } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Escanear stock" };
export const dynamic = "force-dynamic";

export default async function ScanStockPage() {
  await requirePageUser(PERMISSIONS.mastersWrite);
  const [branches, variants] = await Promise.all([
    db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER, select: { id: true, name: true } }),
    db.productVariant.findMany({ where: { active: true }, include: { product: { select: { name: true } }, branchStocks: true } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/maestros/stock" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Stock por local
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Escanear stock</h1>
        <p className="text-sm text-muted-foreground">Con el lector de códigos de barras: cada lectura suma una unidad. Revisá la lista y confirmá; queda registrado en la auditoría.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <StockScanner
            branches={branches}
            variants={variants.map((v) => ({
              id: v.id,
              label: `${v.product.name} · T.${v.size}${variantAttrs(v) ? ` · ${variantAttrs(v)}` : ""}`,
              sku: v.sku,
              barcode: v.barcode,
              stocks: Object.fromEntries(v.branchStocks.map((s) => [s.branchId, s.quantity.toNumber()])),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
