import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MerchandisePurchaseForm } from "@/components/purchasing/merchandise-purchase-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getMerchandiseFormData } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Compra de mercadería" };
export const dynamic = "force-dynamic";

export default async function NewMerchandisePurchasePage() {
  await requirePageUser(PERMISSIONS.purchasesWrite);
  const data = await getMerchandiseFormData();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/compras" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Compras
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Compra de mercadería</h1>
        <p className="text-sm text-muted-foreground">Materia prima, avíos e insumos o producto terminado. Ingresa al stock y actualiza costos de reposición.</p>
      </div>
      <MerchandisePurchaseForm data={data} />
    </div>
  );
}
