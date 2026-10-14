import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentHeader } from "@/components/documents/document-header";
import { variantAttrs } from "@/lib/catalog/variants";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/production/workflow";
import { requirePageUser } from "@/server/auth/session";
import { getRemitForPrint } from "@/server/queries/production-orders.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ remitId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { remitId } = await params;
  const r = await getRemitForPrint(remitId);
  return { title: r ? `Remito ${String(r.number).padStart(6, "0")}` : "Remito" };
}

/** Remito A4 para acompañar las piezas al taller (o firmar la recepción). */
export default async function RemitPrintPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.productionRead);
  const { remitId } = await params;
  const r = await getRemitForPrint(remitId);
  if (!r) notFound();
  const isSend = r.type === "ENVIO";

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>

      <DocumentHeader
        title={isSend ? "Remito envío a taller" : "Remito recepción de taller"}
        number={String(r.number).padStart(8, "0")}
        date={r.date}
        letter="R"
        letterNote="No válido como factura"
      />

      <section className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold uppercase">Taller</p>
          <p className="font-semibold">{r.workshop.name}</p>
          {r.workshop.cuit && <p>CUIT {r.workshop.cuit}</p>}
          {r.workshop.address && <p>{r.workshop.address}</p>}
          {r.workshop.phone && <p>Tel. {r.workshop.phone}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase">Orden de producción</p>
          <p className="font-semibold">OP #{r.order.number}</p>
          <p>
            {r.order.productSku} · {r.order.productName}
          </p>
          <p>Proceso: {STAGE_LABELS[r.stage]}</p>
          {r.order.clientName && <p>Cliente: {r.order.clientName}</p>}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-2">Detalle</th>
            <th className="py-2 text-right">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black/30">
            <td className="py-2">
              {isSend ? "Piezas cortadas / prendas enviadas" : "Prendas recibidas en condiciones"} — {r.order.productName}
            </td>
            <td className="py-2 text-right font-mono text-base font-semibold">{r.pieces}</td>
          </tr>
          {!isSend && (
            <tr className="border-b border-black/30">
              <td className="py-2">Merma / rechazos</td>
              <td className="py-2 text-right font-mono">{r.wasteQty}</td>
            </tr>
          )}
        </tbody>
      </table>

      <section>
        <p className="mb-1 text-xs font-semibold uppercase">Curva de talles de la orden (referencia)</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono">
          {r.order.curve.map((c) => (
            <span key={`${c.size}-${c.color}-${c.fabric}`}>
              {c.size}
              {variantAttrs(c) ? ` (${variantAttrs(c)})` : ""}: {c.quantity}
            </span>
          ))}
        </div>
      </section>

      {!isSend && r.laborTotal > 0 && (
        <section className="flex justify-end">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
            <dt>Fasón por prenda</dt>
            <dd className="text-right font-mono">{formatMoney(r.laborUnitCost)}</dd>
            <dt className="font-semibold">Total fasón</dt>
            <dd className="text-right font-mono font-semibold">{formatMoney(r.laborTotal)}</dd>
          </dl>
        </section>
      )}

      {r.notes && (
        <section>
          <p className="text-xs font-semibold uppercase">Observaciones</p>
          <p>{r.notes}</p>
        </section>
      )}

      <footer className="mt-16 grid grid-cols-2 gap-16">
        <div className="border-t border-black pt-2 text-center">
          {isSend ? "Entrega Coverline" : "Entrega taller"}
          {isSend && r.createdBy && <span className="block text-xs">{r.createdBy}</span>}
        </div>
        <div className="border-t border-black pt-2 text-center">
          {isSend ? "Recibe taller (firma y aclaración)" : "Recibe Coverline"}
          {!isSend && r.createdBy && <span className="block text-xs">{r.createdBy}</span>}
        </div>
      </footer>
    </div>
  );
}
