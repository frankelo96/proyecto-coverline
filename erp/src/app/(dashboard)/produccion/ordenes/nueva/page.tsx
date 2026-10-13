import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewOrderForm } from "@/components/production/new-order-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getNewOrderFormData } from "@/server/queries/production-orders.queries";

export const metadata: Metadata = { title: "Nueva orden de producción" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ producto?: string; cliente?: string; notas?: string }> };

export default async function NewOrderPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.productionWrite);
  const [data, sp] = await Promise.all([getNewOrderFormData(), searchParams]);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/produccion/ordenes" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Órdenes de producción
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Nueva orden de producción</h1>
      <NewOrderForm data={data} prefill={{ productId: sp.producto, clientId: sp.cliente, notes: sp.notas?.slice(0, 500) }} />
    </div>
  );
}
