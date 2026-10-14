import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentHeader } from "@/components/documents/document-header";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
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
  const { orderId } = await params;
  const o = await getPaymentOrderForPrint(orderId);
  // Los pagos de sueldo los ve quien maneja sueldos; el resto, quien ve cuentas a pagar.
  await requirePageUser(o?.salary ? PERMISSIONS.payrollRead : PERMISSIONS.payablesRead);
  if (!o) notFound();

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <DocumentHeader title={o.salary ? "Comprobante de pago al personal" : "Orden de pago"} number={String(o.number).padStart(8, "0")} date={o.date} letter="X" letterNote="No válido como factura" />

      <section>
        <p className="text-xs font-semibold uppercase">{o.salary ? "Empleado" : "Beneficiario"}</p>
        <p className="font-semibold">{o.creditorName}</p>
        {o.creditorCuit && <p>CUIT {o.creditorCuit}</p>}
        {o.salary && (
          <p>
            {o.salary.position}
            {o.salary.cuil && <> · CUIL {o.salary.cuil}</>}
          </p>
        )}
      </section>

      {o.salary ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-2">Concepto</th>
              <th className="py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black/30">
              <td className="py-2 first-letter:uppercase">{o.salary.concept}</td>
              <td className="py-2 text-right font-mono text-base font-bold">{formatMoney(o.amount)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
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
      )}

      <section>
        <p className="mb-1 text-xs font-semibold uppercase">Forma de pago</p>
        <table className="w-full border-collapse">
          <tbody>
            {o.instruments.map((i, idx) => (
              <tr key={idx} className="border-b border-black/30">
                <td className="py-1.5">{i.label}</td>
                <td className="py-1.5 text-right font-mono">{formatMoney(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {o.notes && <p className="mt-3">Observaciones: {o.notes}</p>}
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
