import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { OrderBoard } from "@/components/production/order-board";
import { Button } from "@/components/ui/button";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { listOrdersForBoard } from "@/server/queries/production-orders.queries";

export const metadata: Metadata = { title: "Órdenes de producción" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requirePageUser(PERMISSIONS.productionRead);
  const orders = await listOrdersForBoard();
  const overdue = orders.filter((o) => o.overdue).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Órdenes de producción</h1>
          <p className="text-sm text-muted-foreground">
            {orders.filter((o) => o.status === "EN_PROCESO").length} en proceso
            {overdue > 0 && <span className="font-semibold text-destructive"> · {overdue} con fecha vencida</span>}
          </p>
        </div>
        {hasPermission(user.permissions, PERMISSIONS.productionWrite) && (
          <Button asChild>
            <Link href="/produccion/ordenes/nueva">
              <Plus /> Nueva orden
            </Link>
          </Button>
        )}
      </div>
      <OrderBoard orders={orders} />
    </div>
  );
}
