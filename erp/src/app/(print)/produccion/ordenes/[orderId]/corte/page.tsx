import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentHeader } from "@/components/documents/document-header";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { formatNumber, UOM_SHORT } from "@/lib/format";
import { cutBreakdown, type MaterialAlternative } from "@/lib/production/consumption";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Orden de corte" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

/** Hoja para el cortador: talles a cortar y tela teórica por talle, con lugar para anotar lo real. */
export default async function CutSheetPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.productionRead);
  const { orderId } = await params;
  const o = await db.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      product: { include: { bom: true, materialRules: true } },
      client: { select: { businessName: true } },
      customerOrder: { select: { number: true } },
      items: { include: { variant: { select: { size: true, color: true, fabric: true } } } },
    },
  });
  if (!o) notFound();
  const items = [...o.items].sort(
    (a, b) => (a.variant.color ?? "").localeCompare(b.variant.color ?? "", "es") || (a.variant.fabric ?? "").localeCompare(b.variant.fabric ?? "", "es") || compareSizes(a.variant.size, b.variant.size),
  );
  const breakdown = cutBreakdown(
    o.product.bom.map((b) => ({ rawMaterialId: b.rawMaterialId, quantity: b.quantity.toNumber(), wastePct: b.wastePct.toNumber() })),
    new Map(o.product.materialRules.map((r) => [r.rawMaterialId, { sizeQuantities: r.sizeQuantities as Record<string, number> | null, alternatives: r.alternatives as MaterialAlternative[] | null }])),
    items.map((i) => ({ size: i.variant.size, color: i.variant.color, fabric: i.variant.fabric, quantity: i.quantity })),
  );
  const materials = new Map((await db.rawMaterial.findMany({ where: { id: { in: breakdown.map((b) => b.rawMaterialId) } } })).map((m) => [m.id, m]));
  // En la hoja de corte van las telas; avíos e insumos los arma el taller.
  const fabrics = breakdown.filter((b) => materials.get(b.rawMaterialId)?.type === "TELA");
  const total = items.reduce((a, i) => a + i.quantity, 0);

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-6 bg-white p-8 text-[13px] text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <DocumentHeader title="Orden de corte" number={`OP ${String(o.number).padStart(6, "0")}`} date={o.createdAt} dateLabel="Fecha" internal />
      <section className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-semibold uppercase">Producto</p>
          <p className="font-semibold">
            {o.product.name} ({o.product.sku})
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase">Destino</p>
          <p>
            {o.client ? o.client.businessName : "Stock"}
            {o.customerOrder ? ` · pedido #${o.customerOrder.number}` : ""}
            {o.dueDate ? ` · entrega ${o.dueDate.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}` : ""}
          </p>
        </div>
        {o.notes && <p className="col-span-2">Notas: {o.notes}</p>}
      </section>

      <section>
        <p className="mb-1 text-xs font-semibold uppercase">Talles a cortar ({total} prendas)</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-1.5">Talle</th>
              <th className="py-1.5">Color / tela</th>
              <th className="py-1.5 text-right">Prendas</th>
              <th className="py-1.5 text-right">Cortadas</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-black/30">
                <td className="py-1.5 font-semibold">{i.variant.size}</td>
                <td className="py-1.5">{variantAttrs(i.variant) || "—"}</td>
                <td className="py-1.5 text-right font-mono">{i.quantity}</td>
                <td className="py-1.5 text-right">______</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {fabrics.map((b) => {
        const m = materials.get(b.rawMaterialId)!;
        const uom = UOM_SHORT[m.uom];
        return (
          <section key={b.rawMaterialId} className="break-inside-avoid">
            <p className="mb-1 text-xs font-semibold uppercase">
              Tela: {m.code} · {m.name}
              {m.widthCm ? ` · ancho ${formatNumber(m.widthCm.toNumber())} cm` : ""}
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-y border-black text-left">
                  <th className="py-1.5">Talle</th>
                  <th className="py-1.5">Color / tela</th>
                  <th className="py-1.5 text-right">Prendas</th>
                  <th className="py-1.5 text-right">Consumo por prenda</th>
                  <th className="py-1.5 text-right">Total teórico</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((l, idx) => (
                  <tr key={idx} className="border-b border-black/30">
                    <td className="py-1.5">{l.size}</td>
                    <td className="py-1.5">{[l.color, l.fabric].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-1.5 text-right font-mono">{l.quantity}</td>
                    <td className="py-1.5 text-right font-mono">
                      {formatNumber(l.perUnit)} {uom}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {formatNumber(l.total)} {uom}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex justify-between font-semibold">
              <span>
                Total teórico: {formatNumber(b.total)} {uom}
              </span>
              <span>Real usado: ____________ {uom}</span>
            </p>
          </section>
        );
      })}
      {fabrics.length === 0 && <p>El producto no tiene telas en la ficha técnica.</p>}

      <section className="mt-8 grid grid-cols-3 gap-8 text-center text-xs">
        <p className="border-t border-black pt-1">Cortó</p>
        <p className="border-t border-black pt-1">Fecha</p>
        <p className="border-t border-black pt-1">Controló</p>
      </section>
      <p className="text-xs">Al cerrar el corte en el sistema, cargá las prendas cortadas y la tela real usada: la diferencia ajusta el stock de tela y el costo de la orden.</p>
    </div>
  );
}
