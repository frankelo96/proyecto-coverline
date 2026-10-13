import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { METHOD_LABELS, MOVEMENT_LABELS } from "@/lib/treasury/cash";
import { requirePageUser } from "@/server/auth/session";
import { getSessionReport } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Arqueo de turno" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

export default async function SessionReportPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.cashSession);
  const { sessionId } = await params;
  const r = await getSessionReport(sessionId);
  if (!r) notFound();
  const closed = r.status === "CERRADA";
  const diff = r.difference ?? 0;

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-between gap-2 print:hidden">
        <Link href={`/pos/${r.registerId}`} className="text-sm underline underline-offset-4">
          Volver al POS
        </Link>
        <PrintButton />
      </div>
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div>
          <p className="text-xl font-bold tracking-wide">COVERLINE UNIFORMES</p>
          <p>
            {r.branchName} · {r.registerName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">ARQUEO DE TURNO</p>
          <p>Apertura: {dt(r.openedAt)} — {r.openedBy}</p>
          {r.closedAt && (
            <p>
              Cierre: {dt(r.closedAt)} — {r.closedBy}
            </p>
          )}
        </div>
      </header>

      {closed && (
        <section className="grid grid-cols-3 gap-4">
          <div className="border border-black p-3">
            <p className="text-xs uppercase">Esperado por sistema</p>
            <p className="font-mono text-lg font-semibold">{formatMoney(r.expectedAmount ?? 0)}</p>
          </div>
          <div className="border border-black p-3">
            <p className="text-xs uppercase">Contado (declarado)</p>
            <p className="font-mono text-lg font-semibold">{formatMoney(r.declaredAmount ?? 0)}</p>
          </div>
          <div className={diff === 0 ? "border border-black p-3" : "border-2 border-black bg-black/5 p-3"}>
            <p className="text-xs uppercase">{diff === 0 ? "Diferencia" : diff > 0 ? "Sobrante" : "Faltante"}</p>
            <p className="font-mono text-lg font-semibold">{formatMoney(Math.abs(diff))}</p>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase">Resumen</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>Fondo contado al abrir</dt>
            <dd className="text-right font-mono">{formatMoney(r.openingAmount)}</dd>
            {r.openingAmount !== r.openingExpected && (
              <>
                <dt>Esperado al abrir</dt>
                <dd className="text-right font-mono">{formatMoney(r.openingExpected)}</dd>
              </>
            )}
            <dt>Ventas ({r.salesCount})</dt>
            <dd className="text-right font-mono">{formatMoney(r.salesTotal)}</dd>
            {r.returnsCount > 0 && (
              <>
                <dt>Devoluciones ({r.returnsCount})</dt>
                <dd className="text-right font-mono">-{formatMoney(r.returnsTotal)}</dd>
              </>
            )}
            <dt>Cobranzas de cuenta corriente</dt>
            <dd className="text-right font-mono">{formatMoney(r.receiptsTotal)}</dd>
          </dl>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase">Cobrado por medio</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            {r.byMethod.length === 0 && <dt className="text-black/60">Sin cobros</dt>}
            {r.byMethod.map((m) => (
              <div key={m.method} className="contents">
                <dt>{METHOD_LABELS[m.method]}</dt>
                <dd className="text-right font-mono">{formatMoney(m.amount)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-black/70">Solo el efectivo queda en el cajón; el resto se acredita en banco, Mercado Pago, cartera de cheques o cuenta corriente.</p>
        </div>
      </section>

      <section>
        <p className="mb-1 text-xs font-semibold uppercase">Movimientos del cajón</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-1.5">Hora</th>
              <th className="py-1.5">Tipo</th>
              <th className="py-1.5">Concepto</th>
              <th className="py-1.5">Usuario</th>
              <th className="py-1.5 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {r.movements.map((m) => (
              <tr key={m.id} className="border-b border-black/20">
                <td className="py-1">{new Date(m.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</td>
                <td className="py-1">{MOVEMENT_LABELS[m.type]}</td>
                <td className="py-1">{m.concept}</td>
                <td className="py-1">{m.user}</td>
                <td className="py-1 text-right font-mono">{formatMoney(m.signed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.notes && <p>Observaciones: {r.notes}</p>}

      <footer className="mt-12 grid grid-cols-2 gap-16">
        <div className="border-t border-black pt-2 text-center">Cajero/a</div>
        <div className="border-t border-black pt-2 text-center">Encargado/a</div>
      </footer>
    </div>
  );
}
