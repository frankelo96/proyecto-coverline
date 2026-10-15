import type { Metadata } from "next";

import { BarcodeSvg } from "@/components/documents/barcode-svg";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { decodeLabelItems, labelFormat, paginateLabels } from "@/lib/catalog/labels";
import { variantAttrs } from "@/lib/catalog/variants";
import { formatMoney } from "@/lib/format";
import { finalUnitPrice } from "@/lib/pos/sale-math";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Etiquetas" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ items?: string; formato?: string; precio?: string; saltear?: string }> };

/**
 * Etiquetas autoadhesivas con código de barras: hoja A4 precortada o rollo
 * térmico. Se imprimen desde el navegador con escala 100 % y sin márgenes.
 */
export default async function LabelsPrintPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.mastersRead);
  const sp = await searchParams;
  const fmt = labelFormat(sp.formato);
  const items = decodeLabelItems(sp.items).slice(0, 500);
  const withPrice = sp.precio === "1";
  const variants = await db.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: { product: { select: { name: true, listPrice: true, vatRate: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const labels = items.flatMap((i) => {
    const v = byId.get(i.variantId);
    if (!v) return [];
    const label = {
      key: v.id,
      name: v.product.name,
      attrs: variantAttrs(v),
      size: v.size,
      sku: v.sku,
      barcode: v.barcode ?? "",
      price: withPrice ? finalUnitPrice(v.product.listPrice.toNumber(), v.product.vatRate.toNumber(), v.priceAdjustmentPct.toNumber()) : null,
    };
    return Array.from({ length: i.qty }, () => label);
  });
  const perPage = fmt.cols * fmt.rows;
  const pages = paginateLabels(labels, perPage, fmt.kind === "a4" ? Number(sp.saltear ?? 0) || 0 : 0);
  const small = fmt.height < 30;
  const pageW = fmt.kind === "a4" ? 210 : fmt.width;
  const pageH = fmt.kind === "a4" ? 297 : fmt.height;

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{`@page { size: ${pageW}mm ${pageH}mm; margin: 0; } @media print { body { margin: 0; } }`}</style>
      <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 text-sm print:hidden">
        <p>
          {labels.length} etiquetas · {fmt.label} · {pages.length} {fmt.kind === "a4" ? "hojas" : "etiquetas en el rollo"}. Al imprimir: escala <strong>100 %</strong> (tamaño real), márgenes{" "}
          <strong>ninguno</strong>
          {fmt.kind === "rollo" && <>, y elegí la impresora térmica con papel de {fmt.width} × {fmt.height} mm</>}.
        </p>
        <PrintButton />
      </div>
      {labels.length === 0 && <p className="text-sm text-muted-foreground print:hidden">No hay etiquetas para imprimir.</p>}
      {pages.map((page, p) => (
        <div
          key={p}
          className="relative bg-white text-black shadow print:shadow-none"
          style={{ width: `${pageW}mm`, height: `${pageH}mm`, breakAfter: p < pages.length - 1 ? "page" : "auto", overflow: "hidden" }}
        >
          {page.map((l, i) => {
            if (!l) return null;
            const col = i % fmt.cols;
            const row = Math.floor(i / fmt.cols);
            return (
              <div
                key={i}
                className="absolute flex flex-col overflow-hidden px-[1.5mm] py-[1mm] leading-tight"
                style={{
                  left: `${fmt.marginLeft + col * (fmt.width + fmt.gapX)}mm`,
                  top: `${fmt.marginTop + row * (fmt.height + fmt.gapY)}mm`,
                  width: `${fmt.width}mm`,
                  height: `${fmt.height}mm`,
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={small ? "truncate text-[6pt] font-semibold" : "line-clamp-2 text-[7.5pt] font-semibold"}>{l.name}</span>
                  <span className={small ? "shrink-0 text-[8pt] font-bold" : "shrink-0 text-[11pt] font-bold"}>T.{l.size}</span>
                </div>
                {l.attrs && !small && <span className="truncate text-[6.5pt]">{l.attrs}</span>}
                <div className="flex min-h-0 flex-1 items-stretch justify-center py-[0.5mm]">
                  <BarcodeSvg code={l.barcode} digitsClassName={small ? "text-[6pt]" : "text-[7pt]"} />
                </div>
                <div className="flex items-end justify-between gap-1">
                  <span className={small ? "truncate text-[5pt]" : "truncate font-mono text-[6pt]"}>{small ? "" : l.sku}</span>
                  {l.price !== null && <span className={small ? "text-[7pt] font-bold" : "text-[9pt] font-bold"}>{formatMoney(l.price, { round: true })}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
