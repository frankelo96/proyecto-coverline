import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentHeader, docNumber } from "@/components/documents/document-header";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Orden de producción" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ batchId: string }> };

const fmtDate = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

/** Comprobante de orden de producción: todos los productos del pedido con su curva de talles por color y tela. */
export default async function ProductionBatchPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.productionRead);
  const { batchId } = await params;
  const batch = await db.productionBatch.findUnique({
    where: { id: batchId },
    include: {
      client: { select: { businessName: true, fantasyName: true, documentType: true, documentNumber: true, phone: true } },
      createdBy: { select: { name: true } },
      orders: {
        orderBy: { number: "asc" },
        include: {
          product: { select: { sku: true, name: true } },
          items: { include: { variant: { select: { size: true, color: true, fabric: true } } } },
        },
      },
    },
  });
  if (!batch) notFound();

  const products = batch.orders.map((o) => {
    const sizes = [...new Set(o.items.map((i) => i.variant.size))].sort(compareSizes);
    const groups = new Map<string, Map<string, number>>();
    for (const i of o.items) {
      const g = variantAttrs(i.variant);
      if (!groups.has(g)) groups.set(g, new Map());
      const row = groups.get(g)!;
      row.set(i.variant.size, (row.get(i.variant.size) ?? 0) + i.quantity);
    }
    const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
    const bySize = sizes.map((s) => rows.reduce((a, [, r]) => a + (r.get(s) ?? 0), 0));
    return { o, sizes, rows, bySize, total: o.quantityPlanned };
  });
  const grandTotal = products.reduce((a, p) => a + p.total, 0);

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-between gap-2 print:hidden">
        <Link href="/produccion/ordenes" className="text-sm underline">
          ← Volver a órdenes
        </Link>
        <PrintButton />
      </div>
      <DocumentHeader
        title="Orden de producción"
        number={docNumber(batch.number)}
        date={batch.createdAt}
        dateLabel="Fecha"
        letter="X"
        letterNote="Documento interno"
        footer={batch.dueDate ? [{ label: "Fecha comprometida", value: fmtDate(batch.dueDate) }] : undefined}
        internal
      />

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 border border-black p-3">
        <div>
          <p className="text-xs font-semibold uppercase">Cliente</p>
          <p className="font-semibold">{batch.client ? (batch.client.fantasyName ? `${batch.client.fantasyName} (${batch.client.businessName})` : batch.client.businessName) : "Stock propio"}</p>
          {batch.client && (batch.client.documentNumber || batch.client.phone) && <p>{[batch.client.documentNumber && `${batch.client.documentType} ${batch.client.documentNumber}`, batch.client.phone && `Tel. ${batch.client.phone}`].filter(Boolean).join(" · ")}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase">Resumen</p>
          <p>
            {products.length} {products.length === 1 ? "producto" : "productos"} · <strong>{grandTotal} prendas</strong>
          </p>
          <p>Órdenes: {batch.orders.map((o) => `OP ${docNumber(o.number, 6)}`).join(", ")}</p>
        </div>
        {batch.createdBy && <p className="col-span-2 text-xs">Cargó: {batch.createdBy.name}</p>}
      </section>

      {products.map(({ o, sizes, rows, bySize, total }, idx) => (
        <section key={o.id} className="break-inside-avoid">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="font-semibold">
              {idx + 1}. {o.product.name} <span className="font-normal">({o.product.sku})</span>
            </p>
            <p className="text-xs">
              OP {docNumber(o.number, 6)}
              {o.requiresPersonalization ? " · lleva personalización" : ""}
            </p>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-black">
                <th className="py-1.5 text-left">Color / tela</th>
                {sizes.map((s) => (
                  <th key={s} className="px-1 py-1.5 text-center">
                    {s}
                  </th>
                ))}
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([group, r]) => (
                <tr key={group || "unico"} className="border-b border-black/30">
                  <td className="py-1.5">{group || "—"}</td>
                  {sizes.map((s) => (
                    <td key={s} className="px-1 py-1.5 text-center font-mono">
                      {r.get(s) ?? ""}
                    </td>
                  ))}
                  <td className="py-1.5 text-right font-mono font-semibold">{[...r.values()].reduce((a, q) => a + q, 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-b border-black font-semibold">
                <td className="py-1.5">Subtotal</td>
                {bySize.map((q, i) => (
                  <td key={sizes[i]} className="px-1 py-1.5 text-center font-mono">
                    {q}
                  </td>
                ))}
                <td className="py-1.5 text-right font-mono">{total}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      ))}

      <p className="flex justify-end border-y-2 border-black py-2 text-base font-bold">Total general: {grandTotal} prendas</p>

      {batch.notes && (
        <section>
          <p className="text-xs font-semibold uppercase">Observaciones</p>
          <p className="whitespace-pre-wrap">{batch.notes}</p>
        </section>
      )}

      <section className="mt-10 grid grid-cols-3 gap-8 text-center text-xs">
        <p className="border-t border-black pt-1">Emitió</p>
        <p className="border-t border-black pt-1">Recibió producción</p>
        <p className="border-t border-black pt-1">Conformidad cliente</p>
      </section>
    </div>
  );
}
