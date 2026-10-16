import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/documents/brand-logo";
import { PrintButton } from "@/components/production/print-button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes } from "@/lib/catalog/variants";
import { MATERIAL_TYPE_LABELS, SERVICE_TYPE_LABELS } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/masters/labels";
import { companyInfo } from "@/server/arca/config";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ productId: string }> };

async function load(productId: string) {
  const p = await db.product.findUnique({
    where: { id: productId },
    include: {
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, width: true, height: true } },
      variants: { where: { active: true }, select: { size: true, color: true, fabric: true } },
      bom: { orderBy: { sortOrder: "asc" }, include: { rawMaterial: { select: { name: true, type: true, composition: true, color: true } } } },
      services: { orderBy: { sortOrder: "asc" }, include: { serviceCost: { select: { name: true, type: true } } } },
    },
  });
  if (!p) notFound();
  return p;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).productId);
  return { title: `Ficha descriptiva ${p.sku} - ${p.name}` };
}

const uniq = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== ""))];

function Header({ title, product }: { title: string; product: string }) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-3 pt-4">
        <p className="text-[17px] tracking-wide uppercase underline underline-offset-4">{title}</p>
        <p className="text-[17px] tracking-wide uppercase">{product}</p>
      </div>
      <BrandLogo className="h-20 w-auto" priority />
    </header>
  );
}

function Footer() {
  const c = companyInfo();
  return (
    <footer className="mt-auto flex flex-col gap-2 pt-4">
      <div className="h-[3px] bg-[#E8572E]" />
      <p className="text-center text-[11.5px] leading-relaxed">
        {c.web}
        {c.branches.map((b) => (
          <span key={b.address}>
            {"  /  "}
            {b.address}
            {b.phone && ` · Tel. ${b.phone}`}
          </span>
        ))}
      </p>
    </footer>
  );
}

/**
 * Ficha descriptiva con fotos del producto, con los datos de Coverline: para
 * presentar a clientes y acompañar la ficha técnica y el escandallo. Usa las
 * fotos cargadas en Maestros › Productos (la principal primero) y los datos de
 * la ficha técnica (materiales y procesos, sin costos).
 */
export default async function ProductDescriptiveSheetPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.productionRead);
  const { productId } = await params;
  const p = await load(productId);
  const sizes = uniq(p.variants.map((v) => v.size)).sort(compareSizes);
  const colors = uniq(p.variants.map((v) => v.color));
  const fabrics = uniq(p.variants.map((v) => v.fabric));
  const [main, ...rest] = p.images;
  const page = "flex min-h-[277mm] flex-col gap-5";

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-10 bg-white p-8 text-[13px] text-black print:gap-0 print:p-0">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="flex justify-between gap-2 print:hidden">
        <Link href={`/produccion/fichas/${productId}`} className="text-sm underline underline-offset-4">
          Volver a la ficha
        </Link>
        <PrintButton />
      </div>

      {/* Hoja 1: fotos */}
      <section className={`${page} break-after-page`}>
        <Header title="Ficha técnica" product={p.name} />
        <div className="h-[3px] bg-[#E8572E]" />
        {main ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto propia servida por la API */}
            <img src={`/api/productos/imagenes/${main.id}`} alt={p.name} className="max-h-[165mm] w-auto max-w-full object-contain" />
            {rest.length > 0 && (
              <div className="grid w-full grid-cols-3 gap-3">
                {rest.slice(0, 6).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por la API
                  <img key={img.id} src={`/api/productos/imagenes/${img.id}?w=640`} alt={`${p.name}, otra vista`} className="h-[42mm] w-full object-contain" />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center border border-dashed border-black/40 p-10 text-center print:hidden">
            <p>
              Este producto no tiene fotos. Cargalas en <b>Maestros › Productos › {p.sku} › Fotos</b> (la primera es la principal) y volvé a abrir esta ficha.
            </p>
          </div>
        )}
        <Footer />
      </section>

      {/* Hoja 2: detalles técnicos */}
      <section className={page}>
        <Header title="Detalles técnicos" product={p.name} />
        <div className="h-[3px] bg-[#E8572E]" />
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {(
              [
                ["Código", p.sku],
                ["Rubro", CATEGORY_LABELS[p.category]],
                ["Descripción", p.description],
                ["Talles", sizes.join(" · ")],
                ["Colores", colors.join(" · ")],
                ["Telas", fabrics.join(" · ")],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <tr key={k} className="border-b border-black/30 align-top">
                  <th className="w-36 py-2 pr-4 text-left font-semibold">{k}</th>
                  <td className="py-2 whitespace-pre-line">{v}</td>
                </tr>
              ))}
          </tbody>
        </table>

        {p.bom.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-wide uppercase">Materiales</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-y border-black text-left">
                  <th className="py-1.5">Material</th>
                  <th className="py-1.5">Tipo</th>
                  <th className="py-1.5">Composición / color</th>
                </tr>
              </thead>
              <tbody>
                {p.bom.map((b) => (
                  <tr key={b.id} className="border-b border-black/20">
                    <td className="py-1.5">{b.rawMaterial.name}</td>
                    <td className="py-1.5">{MATERIAL_TYPE_LABELS[b.rawMaterial.type]}</td>
                    <td className="py-1.5">{[b.rawMaterial.composition, b.rawMaterial.color].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {p.services.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-wide uppercase">Procesos de confección</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
              {p.services.map((s) => (
                <li key={s.id}>
                  <b>{SERVICE_TYPE_LABELS[s.serviceCost.type]}</b>: {s.serviceCost.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide uppercase">Observaciones</p>
          <div className="h-7 border-b border-black/40" />
          <div className="h-7 border-b border-black/40" />
          <div className="h-7 border-b border-black/40" />
        </div>
        <Footer />
      </section>
    </div>
  );
}
