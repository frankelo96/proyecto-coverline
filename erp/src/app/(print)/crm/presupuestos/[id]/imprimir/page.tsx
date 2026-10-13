import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { docNumber, DocumentHeader } from "@/components/documents/document-header";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { computeQuoteTotals } from "@/lib/crm/quote-math";
import { formatMoney, formatNumber } from "@/lib/format";
import { CLIENT_TYPE_LABELS } from "@/lib/masters/labels";
import { TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";
import { requirePageUser } from "@/server/auth/session";
import { getQuoteDetail } from "@/server/queries/crm.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const q = await getQuoteDetail((await params).id);
  // El título es el nombre sugerido al "Guardar como PDF".
  return { title: q ? `Presupuesto ${docNumber(q.number)} - ${q.client?.name ?? q.lead?.company ?? q.lead?.name ?? ""}`.trim() : "Presupuesto" };
}

const pct = (n: number) => `${formatNumber(n)}%`;

/** Presupuesto en A4 con el mismo formato que el que envía Coverline hoy. */
export default async function QuotePrintPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.crmRead);
  const q = await getQuoteDetail((await params).id);
  if (!q) notFound();
  const totals = computeQuoteTotals(q.items);
  const taxed = totals.vatByRate.filter((v) => v.rate > 0).reduce((a, v) => a + v.base, 0);
  const untaxed = totals.vatByRate.filter((v) => v.rate === 0).reduce((a, v) => a + v.base, 0);
  const party = q.client?.name ?? q.lead?.company ?? q.lead?.name ?? "-";
  const contact = q.lead?.name && q.lead.name !== party ? q.lead.name : null;

  const clientRows: [string, string][] = [
    ["Cliente", party],
    ["Contacto", contact ?? "-"],
    ["Teléfono", q.client?.phone ?? q.lead?.phone ?? "-"],
    ["Domicilio", q.client?.address ?? "-"],
  ];
  const fiscalRows: [string, string][] = [
    ["CUIT", q.client?.document?.replace(/^(CUIT|CUIL|DNI|PASAPORTE) /, "") ?? "-"],
    ["Condición IVA", q.client ? TAX_CONDITION_LABELS[q.client.taxCondition] : "-"],
    ["Categoría", q.client ? CLIENT_TYPE_LABELS[q.client.type] : "-"],
    ["Vendedor", q.userName],
  ];

  return (
    <div className="mx-auto flex min-h-[297mm] max-w-[210mm] flex-col gap-3 bg-white p-8 text-[12px] text-black print:min-h-0 print:p-0">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="flex justify-between gap-2 print:hidden">
        <Link href={`/crm/presupuestos/${q.id}`} className="text-sm underline underline-offset-4">
          Volver al presupuesto
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-black/60">Para PDF: Imprimir → Destino “Guardar como PDF”</span>
          <PrintButton />
        </div>
      </div>

      <DocumentHeader
        title="Presupuesto"
        number={docNumber(q.number)}
        date={q.createdAt}
        letter="X"
        footer={[{ label: "Fecha de Vto. del Presupuesto", value: new Date(q.validUntil).toLocaleDateString("es-AR") }]}
      />

      <section className="grid grid-cols-2 gap-x-6 border border-black px-4 py-2 text-[12.5px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          {clientRows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-bold">{k}:</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          {fiscalRows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-bold">{k}:</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <table className="w-full border-collapse border border-black text-[11.5px]">
        <thead className="bg-black/15">
          <tr>
            {["Código", "Descripción", "Cant.", "Precio Unit.", "% Bonif.", "Subtotal", "Alícuota IVA", "Subtotal c/IVA"].map((h, i) => (
              <th key={h} className={`border border-black px-1.5 py-1 ${i === 1 ? "text-left" : "text-center"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {q.items.map((i, idx) => {
            const line = totals.lines[idx];
            return (
              <tr key={i.id} className="align-top">
                <td className="border-x border-black px-1.5 py-1 text-center font-mono text-[10px] whitespace-nowrap">{i.sku ?? "-"}</td>
                <td className="border-x border-black px-1.5 py-1 whitespace-pre-line uppercase">{i.description}</td>
                <td className="border-x border-black px-1.5 py-1 text-right">{formatNumber(i.quantity)}</td>
                <td className="border-x border-black px-1.5 py-1 text-right">{formatMoney(i.unitPrice)}</td>
                <td className="border-x border-black px-1.5 py-1 text-right">{pct(i.discountPct)}</td>
                <td className="border-x border-black px-1.5 py-1 text-right">{formatMoney(line.net)}</td>
                <td className="border-x border-black px-1.5 py-1 text-right">{pct(i.vatRate)}</td>
                <td className="border-x border-black px-1.5 py-1 text-right">{formatMoney(line.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex-1" />

      <section className="flex justify-end">
        <dl className="grid min-w-[90mm] grid-cols-[1fr_auto] gap-x-6 gap-y-1 border border-black bg-black/15 px-4 py-3 text-[13px]">
          {taxed > 0 && (
            <>
              <dt>Importe Neto Gravado</dt>
              <dd className="text-right">{formatMoney(taxed)}</dd>
            </>
          )}
          {untaxed > 0 && (
            <>
              <dt>Importe Neto No Gravado</dt>
              <dd className="text-right">{formatMoney(untaxed)}</dd>
            </>
          )}
          {totals.vatByRate
            .filter((v) => v.rate > 0)
            .map((v) => (
              <div key={v.rate} className="contents">
                <dt>IVA {pct(v.rate)}</dt>
                <dd className="text-right">{formatMoney(v.vat)}</dd>
              </div>
            ))}
          <dt className="pt-1 text-base font-bold">Total Presupuesto</dt>
          <dd className="pt-1 text-right text-base font-bold">{formatMoney(totals.total)}</dd>
        </dl>
      </section>

      <section className="min-h-16 border border-black px-4 py-2 text-[13px]">
        <strong>Formas de Pago:</strong> {q.paymentTerms ?? "A convenir"}
      </section>
      <section className="min-h-16 border border-black px-4 py-2 text-[13px]">
        <strong>Entrega y envío:</strong> {q.deliveryTerms ?? "A convenir"}
      </section>
      {q.notes && (
        <section className="border border-black px-4 py-2 text-[13px] whitespace-pre-line">
          <strong>Observaciones:</strong> {q.notes}
        </section>
      )}
      <p className="pt-1 text-[10px] text-black/60">Documento no válido como factura. Precios sujetos a modificación una vez vencido el presupuesto.</p>
    </div>
  );
}
