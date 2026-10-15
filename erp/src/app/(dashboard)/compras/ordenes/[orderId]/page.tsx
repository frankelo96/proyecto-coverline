import { ChevronLeft, MessageCircle, PackageCheck, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClosePurchaseOrder } from "@/components/purchasing/purchase-order-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber, UOM_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PURCHASE_ORDER_STATUS_LABELS } from "@/lib/validations/purchasing";
import { requirePageUser } from "@/server/auth/session";
import { getPurchaseOrderDetail } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Orden de compra" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<{ aviso?: string }> };
const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function PurchaseOrderPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.purchasesRead);
  const { orderId } = await params;
  const { aviso } = await searchParams;
  const o = await getPurchaseOrderDetail(orderId);
  if (!o) notFound();
  const canWrite = hasPermission(user.permissions, PERMISSIONS.purchasesWrite);
  const open = o.status === "ABIERTA" || o.status === "PARCIAL";
  const phone = o.supplier.phone?.replace(/\D/g, "");
  const text = [
    `Hola! Les enviamos la orden de compra N° ${o.number} de Coverline Uniformes:`,
    ...o.items.map((i) => `• ${formatNumber(i.quantity)} ${UOM_SHORT[i.uom]} ${i.description.replace(/^[^·]*·\s*/, "")} a ${formatMoney(i.unitCost)} + IVA`),
    o.expectedDate ? `Entrega: ${date(o.expectedDate)}` : null,
    "Gracias!",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/compras/ordenes" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Órdenes de compra
      </Link>
      <FlashNotice message={aviso} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm text-muted-foreground">
            OC #{o.number} · {date(o.date)}
            {o.expectedDate ? ` · entrega ${date(o.expectedDate)}` : ""}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {o.supplier.name}
            <Badge variant={o.status === "CANCELADA" ? "destructive" : o.status === "RECIBIDA" ? "success" : "outline"}>{PURCHASE_ORDER_STATUS_LABELS[o.status]}</Badge>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/compras/ordenes/${o.id}/imprimir`} target="_blank">
              <Printer /> Imprimir / PDF
            </Link>
          </Button>
          {phone && (
            <Button asChild variant="outline">
              <a href={`https://wa.me/${phone.startsWith("54") ? phone : `54${phone}`}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {open && canWrite && (
            <Button asChild>
              <Link href={`/compras/mercaderia/nueva?oc=${o.id}`}>
                <PackageCheck /> Recibir mercadería
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Artículos</CardTitle>
        </CardHeader>
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Artículo</TableHead>
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right">Recibido</TableHead>
              <TableHead className="text-right">Precio neto</TableHead>
              <TableHead className="pr-5 text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="pl-5">{i.description}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(i.quantity)} {UOM_SHORT[i.uom]}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", i.receivedQty >= i.quantity ? "text-success" : i.receivedQty > 0 ? "text-accent-strong" : "text-muted-foreground")}>
                  {formatNumber(i.receivedQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.unitCost)}</TableCell>
                <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(i.quantity * i.unitCost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="flex flex-col items-end gap-1 pt-4 text-sm">
          <span>Neto {formatMoney(o.subtotal)} · IVA {formatMoney(o.taxTotal)}</span>
          <span className="text-base font-semibold">Total {formatMoney(o.total)}</span>
        </CardContent>
      </Card>

      {o.notes && <p className="text-sm text-muted-foreground">Notas: {o.notes}</p>}
      {o.cancelReason && <p className="text-sm text-destructive">Cerrada: {o.cancelReason}</p>}

      {o.purchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recepciones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {o.purchases.map((p) => (
              <Link key={p.id} href={`/compras/${p.id}`} className="flex justify-between gap-2 py-2 underline-offset-4 hover:underline">
                <span className={cn(p.status === "ANULADA" && "line-through")}>
                  Compra #{p.number} · {p.label} · {date(p.date)}
                </span>
                <span className="font-mono">{formatMoney(p.total)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {open && canWrite && <ClosePurchaseOrder orderId={o.id} partial={o.status === "PARCIAL"} />}
    </div>
  );
}
