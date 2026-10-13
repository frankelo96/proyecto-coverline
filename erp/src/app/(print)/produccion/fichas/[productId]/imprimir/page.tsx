import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentHeader } from "@/components/documents/document-header";
import { PrintButton } from "@/components/production/print-button";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber, formatPct, MATERIAL_TYPE_LABELS, SERVICE_TYPE_LABELS, UOM_SHORT } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/masters/labels";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CostingServiceError, getProductCostSheet } from "@/server/services/costing.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ productId: string }>; searchParams: Promise<{ costos?: string }> };

async function load(productId: string) {
  try {
    return await getProductCostSheet(db, productId);
  } catch (e) {
    if (e instanceof CostingServiceError) notFound();
    throw e;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { product } = await load((await params).productId);
  const withCosts = (await searchParams).costos !== "0";
  return { title: `${withCosts ? "Escandallo" : "Ficha"} ${product.sku} - ${product.name}` };
}

const cell = "border border-black px-1.5 py-1";

/**
 * Ficha técnica imprimible. Con `?costos=0` es la ficha de producto para
 * entregar a talleres (consumos y procesos, sin precios); si no, el escandallo completo.
 */
export default async function ProductSheetPrintPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.productionRead);
  const { productId } = await params;
  const { product, breakdown: b } = await load(productId);
  // Sin permiso de costos solo se imprime la ficha sin precios.
  const withCosts = (await searchParams).costos !== "0" && hasPermission(user.permissions, PERMISSIONS.productionCostWrite);
  const variants = await db.productVariant.findMany({ where: { productId, active: true }, orderBy: { createdAt: "asc" }, select: { size: true, color: true } });
  const sizes = [...new Set(variants.map((v) => v.size))];
  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-3 bg-white p-8 text-[12px] text-black print:p-0">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="flex justify-between gap-2 print:hidden">
        <Link href={`/produccion/fichas/${productId}`} className="text-sm underline underline-offset-4">
          Volver a la ficha
        </Link>
        <div className="flex items-center gap-3">
          <Link href={withCosts ? "?costos=0" : "?"} className="text-sm underline underline-offset-4">
            {withCosts ? "Ver sin costos (para taller)" : "Ver con costos"}
          </Link>
          <PrintButton />
        </div>
      </div>

      <DocumentHeader title={withCosts ? "Escandallo" : "Ficha de producto"} number={product.sku} date={new Date()} internal />

      <section className="grid grid-cols-2 gap-x-6 border border-black px-4 py-2 text-[12.5px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="font-bold">Producto:</dt>
          <dd>{product.name}</dd>
          <dt className="font-bold">Categoría:</dt>
          <dd>{CATEGORY_LABELS[product.category]}</dd>
          {product.description && (
            <>
              <dt className="font-bold">Descripción:</dt>
              <dd className="whitespace-pre-line">{product.description}</dd>
            </>
          )}
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="font-bold">Talles:</dt>
          <dd>{sizes.join(" · ") || "-"}</dd>
          <dt className="font-bold">Colores:</dt>
          <dd>{colors.join(" · ") || "-"}</dd>
        </dl>
      </section>

      <section>
        <p className="mb-1 text-[11px] font-bold uppercase">Materiales por prenda</p>
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="bg-black/15">
            <tr>
              <th className={`${cell} text-left`}>Código</th>
              <th className={`${cell} text-left`}>Material</th>
              <th className={cell}>Tipo</th>
              <th className={cell}>Consumo</th>
              <th className={cell}>Merma</th>
              <th className={cell}>Consumo bruto</th>
              {withCosts && <th className={cell}>Costo unit.</th>}
              {withCosts && <th className={cell}>Subtotal</th>}
            </tr>
          </thead>
          <tbody>
            {b.materials.length === 0 && (
              <tr>
                <td colSpan={withCosts ? 8 : 6} className={`${cell} text-center`}>
                  Sin materiales cargados
                </td>
              </tr>
            )}
            {b.materials.map((m, i) => (
              <tr key={i}>
                <td className={`${cell} font-mono text-[10px]`}>{m.code ?? "-"}</td>
                <td className={cell}>{m.name}</td>
                <td className={`${cell} text-center`}>{MATERIAL_TYPE_LABELS[m.type]}</td>
                <td className={`${cell} text-right`}>
                  {formatNumber(m.quantity)} {UOM_SHORT[m.uom]}
                </td>
                <td className={`${cell} text-right`}>{formatPct(m.wastePct)}</td>
                <td className={`${cell} text-right`}>
                  {formatNumber(m.grossQuantity)} {UOM_SHORT[m.uom]}
                </td>
                {withCosts && <td className={`${cell} text-right`}>{formatMoney(m.unitCost)}</td>}
                {withCosts && <td className={`${cell} text-right`}>{formatMoney(m.subtotal)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <p className="mb-1 text-[11px] font-bold uppercase">Procesos y talleres</p>
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="bg-black/15">
            <tr>
              <th className={`${cell} text-left`}>Proceso</th>
              <th className={cell}>Tipo</th>
              <th className={cell}>Cantidad</th>
              {withCosts && <th className={cell}>Tarifa</th>}
              {withCosts && <th className={cell}>Subtotal</th>}
            </tr>
          </thead>
          <tbody>
            {b.services.length === 0 && (
              <tr>
                <td colSpan={withCosts ? 5 : 3} className={`${cell} text-center`}>
                  Sin procesos cargados
                </td>
              </tr>
            )}
            {b.services.map((s, i) => (
              <tr key={i}>
                <td className={cell}>{s.name}</td>
                <td className={`${cell} text-center`}>{SERVICE_TYPE_LABELS[s.type]}</td>
                <td className={`${cell} text-right`}>
                  {formatNumber(s.quantity)} {s.unitLabel ?? ""}
                </td>
                {withCosts && <td className={`${cell} text-right`}>{formatMoney(s.unitCost)}</td>}
                {withCosts && <td className={`${cell} text-right`}>{formatMoney(s.subtotal)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {withCosts ? (
        <section className="flex justify-end">
          <dl className="grid min-w-[95mm] grid-cols-[1fr_auto] gap-x-6 gap-y-1 border border-black bg-black/15 px-4 py-3 text-[12.5px]">
            <dt>Materiales</dt>
            <dd className="text-right">{formatMoney(b.materialsCost)}</dd>
            <dt>Procesos</dt>
            <dd className="text-right">{formatMoney(b.servicesCost)}</dd>
            <dt>Gastos generales ({formatPct(b.overheadPct)})</dt>
            <dd className="text-right">{formatMoney(b.overheadCost)}</dd>
            <dt className="font-bold">Costo total por prenda</dt>
            <dd className="text-right font-bold">{formatMoney(b.totalCost)}</dd>
            <dt className="pt-2">
              Precio sugerido neto ({b.pricingMode === "MARKUP" ? "recargo" : "margen"} {formatPct(b.pricingPct)})
            </dt>
            <dd className="pt-2 text-right">{formatMoney(b.suggestedNetPrice)}</dd>
            <dt>Precio sugerido final (IVA {formatPct(b.vatRate)})</dt>
            <dd className="text-right">{formatMoney(b.suggestedFinalPrice)}</dd>
            {b.listPriceCheck && (
              <>
                <dt className="pt-2 font-bold">Precio de lista neto vigente</dt>
                <dd className="pt-2 text-right font-bold">{formatMoney(b.listPriceCheck.listPrice)}</dd>
                <dt>Margen real</dt>
                <dd className="text-right">{formatPct(b.listPriceCheck.marginPct)}</dd>
              </>
            )}
          </dl>
        </section>
      ) : (
        <section className="min-h-24 border border-black px-4 py-2">
          <p className="text-[11px] font-bold uppercase">Observaciones para el taller</p>
        </section>
      )}

      <footer className="mt-10 grid grid-cols-2 gap-16 text-center">
        <div className="border-t border-black pt-2">Elaboró</div>
        <div className="border-t border-black pt-2">{withCosts ? "Aprobó" : "Recibió (taller)"}</div>
      </footer>
    </div>
  );
}
