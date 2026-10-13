import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { requirePageUser } from "@/server/auth/session";
import { getReceiptForPrint } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Recibo" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ receiptId: string }> };

export default async function ReceiptPrintPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.receivablesCollect);
  const { receiptId } = await params;
  const r = await getReceiptForPrint(receiptId);
  if (!r) notFound();
  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div>
          <p className="text-xl font-bold tracking-wide">COVERLINE UNIFORMES</p>
          <p>Cobranzas</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">RECIBO</p>
          <p className="font-mono text-base">N° {String(r.number).padStart(6, "0")}</p>
          <p>Fecha: {new Date(r.date).toLocaleDateString("es-AR")}</p>
          <p className="text-xs">Documento no válido como factura</p>
        </div>
      </header>
      <p>
        Recibimos de <strong>{r.clientName}</strong>
        {r.clientDocument && ` (${r.clientDocument})`} la suma de <strong className="font-mono">{formatMoney(r.amount)}</strong>.
      </p>
      <section>
        <p className="mb-1 text-xs font-semibold uppercase">Valores recibidos</p>
        <table className="w-full border-collapse">
          <tbody>
            {r.payments.map((p, i) => (
              <tr key={i} className="border-b border-black/30">
                <td className="py-1.5">
                  {METHOD_LABELS[p.method]}
                  {p.detail && ` — ${p.detail}`}
                </td>
                <td className="py-1.5 text-right font-mono">{formatMoney(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <p className="mb-1 text-xs font-semibold uppercase">Imputado a</p>
        <table className="w-full border-collapse">
          <tbody>
            {r.allocations.map((a, i) => (
              <tr key={i} className="border-b border-black/30">
                <td className="py-1.5">{a.description}</td>
                <td className="py-1.5 text-right font-mono">{formatMoney(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {r.notes && <p>Observaciones: {r.notes}</p>}
      <footer className="mt-12 grid grid-cols-2 gap-16">
        <div />
        <div className="border-t border-black pt-2 text-center">
          Por Coverline Uniformes
          <span className="block text-xs">{r.createdBy}</span>
        </div>
      </footer>
    </div>
  );
}
