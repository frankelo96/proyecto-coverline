import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/validations/purchasing";
import { requirePageUser } from "@/server/auth/session";
import { getPaymentOrderForPrint } from "@/server/queries/purchasing.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderId } = await params;
  const o = await getPaymentOrderForPrint(orderId);
  return { title: o ? `Orden de pago ${String(o.number).padStart(6, "0")}` : "Orden de pago" };
}

export default async function PaymentOrderPrintPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.payablesRead);
  const { orderId } = await params;
  const o = await getPaymentOrderForPrint(orderId);
  if (!o) notFound();

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div>
          <p className="text-xl font-bold tracking-wide">COVERLINE UNIFORMES</p>
          <p>Administración</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">ORDEN DE PAGO</p>
          <p className="font-mono text-base">N° {String(o.number).padStart(6, "0")}</p>
          <p>Fecha: {new Date(o.date).toLocaleDateString("es-AR")}</p>
        </div>
      </header>

      <section>
        <p className="text-xs font-semibold uppercase">Beneficiario</p>
        <p className="font-semibold">{o.creditorName}</p>
        {o.creditorCuit && <p>CUIT {o.creditorCuit}</p>}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-2">Comprobante cancelado</th>
            <th className="py-2">Vencimiento</th>
            <th className="py-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l, i) => (
            <tr key={i} className="border-b border-black/30">
              <td className="py-2">{l.description}</td>
              <td className="py-2">{l.dueDate ? new Date(l.dueDate).toLocaleDateString("es-AR") : "—"}</td>
              <td className="py-2 text-right font-mono">{formatMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="py-2 text-right font-semibold">
              Total pagado
            </td>
            <td className="py-2 text-right font-mono text-base font-bold">{formatMoney(o.amount)}</td>
          </tr>
        </tfoot>
      </table>

      <section className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase">Forma de pago</p>
          <p>
            {PAYMENT_METHOD_LABELS[o.method as keyof typeof PAYMENT_METHOD_LABELS] ?? o.method} — {o.registerName}
          </p>
          {o.reference && <p>Referencia: {o.reference}</p>}
        </div>
        {o.notes && (
          <div>
            <p className="text-xs font-semibold uppercase">Observaciones</p>
            <p>{o.notes}</p>
          </div>
        )}
      </section>

      <footer className="mt-16 grid grid-cols-2 gap-16">
        <div className="border-t border-black pt-2 text-center">
          Autorizó
          <span className="block text-xs">{o.createdBy}</span>
        </div>
        <div className="border-t border-black pt-2 text-center">Recibí conforme (firma y aclaración)</div>
      </footer>
    </div>
  );
}
