import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewOrderForm } from "@/components/production/new-order-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getNewOrderFormData } from "@/server/queries/production-orders.queries";

export const metadata: Metadata = { title: "Nueva orden de producción" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  await requirePageUser(PERMISSIONS.productionWrite);
  const data = await getNewOrderFormData();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/produccion/ordenes" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Órdenes de producción
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Nueva orden de producción</h1>
      <NewOrderForm data={data} />
    </div>
  );
}
