import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isoLocalDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/lib/validations/purchasing";
import { requirePageUser } from "@/server/auth/session";
import { listPurchaseOrders } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Órdenes de compra" };
export const dynamic = "force-dynamic";

const VARIANT = { ABIERTA: "outline", PARCIAL: "accent", RECIBIDA: "success", CANCELADA: "destructive" } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

type Props = { searchParams: Promise<{ todas?: string; aviso?: string }> };

export default async function PurchaseOrdersPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.purchasesRead);
  const { todas, aviso } = await searchParams;
  const all = todas === "1";
  const rows = await listPurchaseOrders(!all);
  const today = isoLocalDate();
  return (
    <div className="flex flex-col gap-6">
      <FlashNotice message={aviso} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Órdenes de compra</h1>
          <p className="text-sm text-muted-foreground">Lo que se le pidió a cada proveedor y a qué precio. Al llegar la mercadería se carga la compra contra la orden.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={all ? "/compras/ordenes" : "/compras/ordenes?todas=1"}>{all ? "Solo pendientes" : "Ver todas"}</Link>
          </Button>
          {hasPermission(user.permissions, PERMISSIONS.purchasesWrite) && (
            <Button asChild>
              <Link href="/compras/ordenes/nueva">
                <Plus /> Nueva orden de compra
              </Link>
            </Button>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{all ? "No hay órdenes de compra." : "No hay órdenes pendientes de recibir."}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Orden</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Entrega esperada</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const late = r.expectedDate && r.expectedDate.slice(0, 10) < today && (r.status === "ABIERTA" || r.status === "PARCIAL");
                return (
                  <TableRow key={r.id}>
                    <TableCell className="pl-5">
                      <Link href={`/compras/ordenes/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                        OC #{r.number}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{date(r.date)}</span>
                    </TableCell>
                    <TableCell>{r.supplier}</TableCell>
                    <TableCell>
                      <Badge variant={VARIANT[r.status]}>{PURCHASE_ORDER_STATUS_LABELS[r.status]}</Badge>
                    </TableCell>
                    <TableCell className={cn(late && "font-semibold text-destructive")}>{r.expectedDate ? `${date(r.expectedDate)}${late ? " (atrasada)" : ""}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.progressPct}%</TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(r.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
