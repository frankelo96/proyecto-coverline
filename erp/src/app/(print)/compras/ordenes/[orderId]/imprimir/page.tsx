import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentHeader } from "@/components/documents/document-header";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber, UOM_SHORT } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { getPurchaseOrderDetail } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Orden de compra" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

export default async function PurchaseOrderPrintPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.purchasesRead);
  const o = await getPurchaseOrderDetail((await params).orderId);
  if (!o) notFound();
  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <DocumentHeader title="Orden de compra" number={String(o.number).padStart(8, "0")} date={o.date} letter="X" letterNote="No válido como factura" />
      <section>
        <p className="text-xs font-semibold uppercase">Proveedor</p>
        <p className="font-semibold">{o.supplier.name}</p>
        {o.supplier.cuit && <p>CUIT {o.supplier.cuit}</p>}
        {o.expectedDate && <p className="mt-1 font-semibold">Entrega solicitada: {new Date(o.expectedDate).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p>}
      </section>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-2">Artículo</th>
            <th className="py-2 text-right">Cantidad</th>
            <th className="py-2 text-right">Precio unit. neto</th>
            <th className="py-2 text-right">IVA</th>
            <th className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b border-black/30">
              <td className="py-1.5">{i.description}</td>
              <td className="py-1.5 text-right">
                {formatNumber(i.quantity)} {UOM_SHORT[i.uom]}
              </td>
              <td className="py-1.5 text-right font-mono">{formatMoney(i.unitCost)}</td>
              <td className="py-1.5 text-right">{formatNumber(i.vatRate)}%</td>
              <td className="py-1.5 text-right font-mono">{formatMoney(i.quantity * i.unitCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto flex w-64 flex-col gap-1">
        <p className="flex justify-between">
          <span>Neto</span>
          <span className="font-mono">{formatMoney(o.subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>IVA</span>
          <span className="font-mono">{formatMoney(o.taxTotal)}</span>
        </p>
        <p className="flex justify-between border-t border-black pt-1 text-base font-bold">
          <span>Total</span>
          <span className="font-mono">{formatMoney(o.total)}</span>
        </p>
      </div>
      {o.notes && <p>Observaciones: {o.notes}</p>}
      <p className="text-xs">Por favor, indicar el número de orden de compra en el remito y en la factura.</p>
    </div>
  );
}
