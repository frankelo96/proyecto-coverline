import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/documents/brand-logo";
import { PrintButton } from "@/components/production/print-button";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { ORDER_STATUS_LABELS } from "@/lib/validations/orders";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Pedido" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<{ ancho?: string }> };

const PRINTABLE_MM = { 58: 48, 80: 72 } as const;
const TZ = "America/Argentina/Buenos_Aires";

/** Comprobante del pedido y de las señas cobradas (no es un comprobante fiscal). */
export default async function OrderPrintPage({ params, searchParams }: Props) {
  await requirePageUser(PERMISSIONS.posSell);
  const { orderId } = await params;
  const width = (await searchParams).ancho === "58" ? 58 : 80;
  const o = await db.customerOrder.findUnique({
    where: { id: orderId },
    include: { client: true, branch: true, items: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { createdAt: "asc" } } },
  });
  if (!o) notFound();
  const mm = PRINTABLE_MM[width];
  const deposited = o.payments.reduce((a, p) => a + p.amount.toNumber(), 0);

  return (
    <div className="flex flex-col items-center">
      <style>{`@page { size: ${width}mm auto; margin: 2mm 4mm; }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 print:hidden">
        {([58, 80] as const).map((w) => (
          <Button key={w} asChild variant={w === width ? "default" : "outline"} size="sm">
            <Link href={`?ancho=${w}`}>{w} mm</Link>
          </Button>
        ))}
        <PrintButton />
      </div>
      <div className="box-content flex flex-col gap-2 border border-dashed border-black/30 bg-white p-2 text-[11px] leading-snug text-black print:border-0 print:p-0" style={{ width: `${mm}mm` }}>
        <div className="flex justify-center">
          <BrandLogo className="h-auto w-[70%]" priority />
        </div>
        <p className="text-center text-sm font-bold tracking-wide">PEDIDO N° {o.number}</p>
        <p className="text-center">Comprobante no válido como factura</p>
        <div className="border-t border-dashed border-black pt-1">
          <p>{o.createdAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: TZ })}{o.branch ? ` · ${o.branch.name}` : ""}</p>
          <p>Cliente: {o.client.businessName}</p>
          {o.client.documentNumber && <p>Doc.: {o.client.documentNumber}</p>}
          {o.promisedDate && <p className="font-bold">Entrega: {o.promisedDate.toLocaleDateString("es-AR", { timeZone: TZ })}</p>}
          <p>Estado: {ORDER_STATUS_LABELS[o.status]}</p>
        </div>
        <div className="border-t border-dashed border-black pt-1">
          {o.items.map((i) => (
            <div key={i.id} className="mb-0.5">
              <p>{i.description}</p>
              <p className="flex justify-between">
                <span>
                  {formatNumber(i.quantity.toNumber())} x {formatMoney(i.unitPrice.toNumber())}
                  {i.discountPct.gt(0) ? ` (-${formatNumber(i.discountPct.toNumber())}%)` : ""}
                </span>
                <span>{formatMoney(i.subtotal.toNumber())}</span>
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-black pt-1">
          <p className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(o.total.toNumber())}</span>
          </p>
          {o.payments.map((p) => (
            <p key={p.id} className="flex justify-between">
              <span>
                Seña {p.createdAt.toLocaleDateString("es-AR", { timeZone: TZ })} · {METHOD_LABELS[p.method]}
              </span>
              <span>-{formatMoney(p.amount.toNumber())}</span>
            </p>
          ))}
          {o.status !== "CANCELADO" && o.status !== "ENTREGADO" && (
            <p className="flex justify-between text-sm font-bold">
              <span>SALDO</span>
              <span>{formatMoney(Math.max(0, o.total.toNumber() - deposited))}</span>
            </p>
          )}
        </div>
        {o.notes && <p className="border-t border-dashed border-black pt-1">Notas: {o.notes}</p>}
        <p className="border-t border-dashed border-black pt-1 text-center text-[10px]">Presentá este comprobante para retirar el pedido. Los precios quedan fijados al tomar el pedido.</p>
      </div>
    </div>
  );
}
