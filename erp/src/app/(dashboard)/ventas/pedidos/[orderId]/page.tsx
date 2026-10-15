import { ChevronLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelForm, DeliverForm, DepositForm, ProductionButton, StatusButtons } from "@/components/orders/order-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/validations/orders";
import { requirePageUser } from "@/server/auth/session";
import { getOrderDetail } from "@/server/queries/orders.queries";

export const metadata: Metadata = { title: "Pedido" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<{ aviso?: string }> };

const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const d = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
const OP_STATUS: Record<string, string> = { BORRADOR: "Borrador", EN_PROCESO: "En proceso", COMPLETADA: "Terminada", CANCELADA: "Cancelada" };

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.posSell);
  const { orderId } = await params;
  const { aviso } = await searchParams;
  const o = await getOrderDetail(orderId, user.branchId);
  if (!o) notFound();
  const open = o.status !== "ENTREGADO" && o.status !== "CANCELADO";
  const activeOps = o.productionOrders.filter((p) => p.status !== "CANCELADA");
  const canProduce = open && o.status !== "LISTO" && activeOps.length === 0 && hasPermission(user.permissions, PERMISSIONS.productionWrite) && o.items.some((i) => i.variantId);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/ventas/pedidos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Pedidos
      </Link>
      <FlashNotice message={aviso} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm text-muted-foreground">
            Pedido #{o.number} · {dt(o.createdAt)}
            {o.branch ? ` · ${o.branch.name}` : ""}
            {o.quote && (
              <>
                {" · "}
                <Link href={`/crm/presupuestos/${o.quote.id}`} className="underline underline-offset-4">
                  presupuesto #{o.quote.number}
                </Link>
              </>
            )}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {o.client.name}
            <Badge variant={o.status === "CANCELADO" ? "destructive" : o.status === "LISTO" ? "success" : "outline"}>{ORDER_STATUS_LABELS[o.status]}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {o.client.document ?? "Sin documento"}
            {o.client.phone ? ` · ${o.client.phone}` : ""}
            {o.promisedDate ? ` · entrega prometida ${d(o.promisedDate)}` : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/pos/pedidos/${o.id}`} target="_blank">
            <Printer /> Comprobante del pedido
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Artículos</CardTitle>
            </CardHeader>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Artículo</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="pr-5 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="pl-5">
                      {i.description}
                      {i.discountPct > 0 && <span className="block text-xs text-muted-foreground">Descuento {formatNumber(i.discountPct)}%</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatNumber(i.quantity)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.unitPrice)}</TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(i.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {o.notes && <CardContent className="pt-4 text-sm text-muted-foreground">Notas: {o.notes}</CardContent>}
          </Card>

          {o.status === "CANCELADO" && <p className="text-sm text-destructive">Cancelado: {o.cancelReason}</p>}
          {o.sale && (
            <Card>
              <CardContent className="pt-6 text-sm">
                Entregado el {o.deliveredAt ? dt(o.deliveredAt) : ""} con la{" "}
                <Link href={`/ventas/${o.sale.id}`} className="font-medium underline underline-offset-4">
                  venta #{o.sale.number} ({o.sale.voucher})
                </Link>
                .
              </CardContent>
            </Card>
          )}

          {open && (
            <Card>
              <CardHeader>
                <CardTitle>Entregar</CardTitle>
              </CardHeader>
              <CardContent>
                <DeliverForm key={`${o.status}-${activeOps.length}-${o.deposited}`} order={o} />
              </CardContent>
            </Card>
          )}
          {open && o.balance > 0.004 && (
            <Card>
              <CardHeader>
                <CardTitle>Cobrar seña / pago a cuenta</CardTitle>
              </CardHeader>
              <CardContent>
                <DepositForm key={o.deposited} order={o} />
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2 pt-6 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-semibold">{formatMoney(o.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Señado</span>
                <span className="font-mono">{formatMoney(o.deposited)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Saldo</span>
                <span className="font-mono">{formatMoney(o.status === "ENTREGADO" || o.status === "CANCELADO" ? 0 : Math.max(0, o.balance))}</span>
              </div>
              {o.payments.length > 0 && (
                <div className="border-t pt-2">
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Señas</p>
                  {o.payments.map((p) => (
                    <div key={p.id} className="flex justify-between gap-2">
                      <span>
                        {d(p.date)} · {p.method}
                        {p.detail && <span className="text-muted-foreground"> · {p.detail}</span>}
                      </span>
                      <span className="font-mono">{formatMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(activeOps.length > 0 || canProduce) && (
            <Card>
              <CardHeader>
                <CardTitle>Producción</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {o.productionOrders.map((p) => (
                  <Link key={p.id} href={`/produccion/ordenes/${p.id}`} className="flex justify-between gap-2 underline-offset-4 hover:underline">
                    <span>OP #{p.number}</span>
                    <span className="text-muted-foreground">
                      {OP_STATUS[p.status] ?? p.status} · {p.quantityFinished}/{p.quantityPlanned}
                    </span>
                  </Link>
                ))}
                {canProduce && <ProductionButton orderId={o.id} />}
                {activeOps.length > 0 && <p className="text-xs text-muted-foreground">Lo producido ingresa al stock mayorista; al entregar sale de ahí.</p>}
              </CardContent>
            </Card>
          )}

          {open && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6">
                <StatusButtons order={o} />
                {hasPermission(user.permissions, PERMISSIONS.posReturn) && <CancelForm order={o} />}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
