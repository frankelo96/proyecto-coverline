import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { computeQuoteTotals } from "@/lib/crm/quote-math";
import { formatMoney, formatNumber } from "@/lib/format";
import { TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";
import { companyInfo } from "@/server/arca/config";
import { requirePageUser } from "@/server/auth/session";
import { getQuoteDetail } from "@/server/queries/crm.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const q = await getQuoteDetail((await params).id);
  // El título es el nombre sugerido al "Guardar como PDF".
  return { title: q ? `Presupuesto ${q.number} - ${q.client?.name ?? q.lead?.company ?? q.lead?.name ?? ""}`.trim() : "Presupuesto" };
}

const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

export default async function QuotePrintPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.crmRead);
  const q = await getQuoteDetail((await params).id);
  if (!q) notFound();
  const company = companyInfo();
  const totals = computeQuoteTotals(q.items);
  const showVat = q.client?.taxCondition === "RESPONSABLE_INSCRIPTO" || !q.client;
  const discountWithVat = totals.lines.reduce((a, l, i) => a + l.discount * (1 + q.items[i].vatRate / 100), 0);

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[12.5px] text-black print:p-0">
      <style>{`@page { size: A4; margin: 14mm 12mm; }`}</style>
      <div className="flex justify-between gap-2 print:hidden">
        <Link href={`/crm/presupuestos/${q.id}`} className="text-sm underline underline-offset-4">
          Volver al presupuesto
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-black/60">Para PDF: Imprimir → Destino “Guardar como PDF”</span>
          <PrintButton />
        </div>
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-2xl font-bold tracking-wide">COVERLINE UNIFORMES</p>
          <p>{company.legalName}</p>
          {company.cuit && <p>CUIT {company.cuit} · {company.taxCondition}</p>}
          {company.address && <p>{company.address}</p>}
          <p>Recta Martinolli · Villa Allende</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">PRESUPUESTO</p>
          <p className="font-mono text-lg">N° {String(q.number).padStart(6, "0")}</p>
          <p>Fecha: {date(q.createdAt)}</p>
          <p className="font-semibold">Válido hasta: {date(q.validUntil)}</p>
          <p className="mt-1 text-[10px] uppercase">Documento no válido como factura</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 border border-black p-3">
        <div>
          <p className="text-[10px] font-semibold uppercase">Cliente</p>
          <p className="font-semibold">{q.client?.name ?? q.lead?.company ?? q.lead?.name}</p>
          {q.lead?.company && !q.client && <p>At. {q.lead.name}</p>}
          {q.client?.document && <p>{q.client.document}</p>}
          {q.client && <p>{TAX_CONDITION_LABELS[q.client.taxCondition]}</p>}
        </div>
        <div>
          {q.client?.address && <p>{q.client.address}</p>}
          {(q.client?.email ?? q.lead?.email) && <p>{q.client?.email ?? q.lead?.email}</p>}
          <p className="mt-1">Atendido por: {q.userName}</p>
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1.5 pr-2">Descripción</th>
            <th className="py-1.5 pr-2 text-right">Cant.</th>
            <th className="py-1.5 pr-2 text-right">Precio unit.{showVat ? " neto" : ""}</th>
            <th className="py-1.5 pr-2 text-right">Bonif.</th>
            {showVat && <th className="py-1.5 pr-2 text-right">IVA</th>}
            <th className="py-1.5 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((i, idx) => {
            const line = totals.lines[idx];
            // Consumidor final / monotributo: precios con IVA incluido.
            const unit = showVat ? i.unitPrice : i.unitPrice * (1 + i.vatRate / 100);
            return (
              <tr key={i.id} className="border-b border-black/20 align-top">
                <td className="py-1.5 pr-2 whitespace-pre-line">
                  {i.sku && <span className="mr-1.5 font-mono text-[10px]">{i.sku}</span>}
                  {i.description}
                </td>
                <td className="py-1.5 pr-2 text-right">{formatNumber(i.quantity)}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{formatMoney(unit)}</td>
                <td className="py-1.5 pr-2 text-right">{i.discountPct ? `${formatNumber(i.discountPct)}%` : ""}</td>
                {showVat && <td className="py-1.5 pr-2 text-right">{formatNumber(i.vatRate)}%</td>}
                <td className="py-1.5 text-right font-mono">{formatMoney(showVat ? line.net : line.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="flex justify-end">
        <dl className="grid w-80 grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          {showVat ? (
            <>
              <dt>Subtotal neto</dt>
              <dd className="text-right font-mono">{formatMoney(totals.subtotal)}</dd>
              {totals.vatByRate.map((v) => (
                <div key={v.rate} className="contents">
                  <dt>IVA {formatNumber(v.rate)}%</dt>
                  <dd className="text-right font-mono">{formatMoney(v.vat)}</dd>
                </div>
              ))}
            </>
          ) : (
            totals.discountTotal > 0 && (
              <>
                <dt>Bonificaciones incluidas</dt>
                <dd className="text-right font-mono">{formatMoney(discountWithVat)}</dd>
              </>
            )
          )}
          <dt className="border-t-2 border-black pt-1 text-base font-bold">TOTAL</dt>
          <dd className="border-t-2 border-black pt-1 text-right font-mono text-base font-bold">{formatMoney(totals.total)}</dd>
          {!showVat && <dd className="col-span-2 text-right text-[10px]">Precios con IVA incluido</dd>}
        </dl>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase">Forma de pago</p>
          <p>{q.paymentTerms ?? "A convenir"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase">Plazo de entrega</p>
          <p>{q.deliveryTerms ?? "A convenir"}</p>
        </div>
        {q.notes && (
          <div className="col-span-2">
            <p className="text-[10px] font-semibold uppercase">Observaciones</p>
            <p className="whitespace-pre-line">{q.notes}</p>
          </div>
        )}
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-16 text-center">
        <div className="border-t border-black pt-2">Coverline Uniformes</div>
        <div className="border-t border-black pt-2">Aceptación del cliente (firma y aclaración)</div>
      </footer>
    </div>
  );
}
