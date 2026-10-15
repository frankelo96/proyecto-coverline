import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { OrderForm } from "@/components/orders/order-form";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isoLocalDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { getOrderFormData } from "@/server/queries/orders.queries";

export const metadata: Metadata = { title: "Nuevo pedido" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ presupuesto?: string }> };

export default async function NewOrderPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.posSell);
  const { presupuesto } = await searchParams;
  const data = await getOrderFormData(user.branchId, presupuesto ?? null);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/ventas/pedidos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Pedidos
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo pedido</h1>
        <p className="text-sm text-muted-foreground">El precio queda fijado al tomar el pedido. La seña se puede cobrar ahora o después desde el pedido.</p>
      </div>
      <OrderForm data={data} canDiscount={hasPermission(user.permissions, PERMISSIONS.posDiscount)} today={isoLocalDate()} />
    </div>
  );
}
