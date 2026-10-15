import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MerchandisePurchaseForm } from "@/components/purchasing/merchandise-purchase-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getMerchandiseFormData } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Nueva orden de compra" };
export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  await requirePageUser(PERMISSIONS.purchasesWrite);
  const data = await getMerchandiseFormData();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/compras/ordenes" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Órdenes de compra
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Nueva orden de compra</h1>
        <p className="text-sm text-muted-foreground">Lo que se le pide al proveedor y el precio pactado (sin IVA). No mueve stock ni genera deuda: eso pasa al recibir la mercadería.</p>
      </div>
      <MerchandisePurchaseForm data={data} mode="order" />
    </div>
  );
}
