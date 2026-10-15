import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/documents/brand-logo";
import { PrintButton } from "@/components/production/print-button";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Vale" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ creditId: string }>; searchParams: Promise<{ ancho?: string }> };

const PRINTABLE_MM = { 58: 48, 80: 72 } as const;
const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** Vale de cambio / saldo a favor para impresora de tickets. */
export default async function StoreCreditPrintPage({ params, searchParams }: Props) {
  await requirePageUser(PERMISSIONS.posSell);
  const { creditId } = await params;
  const width = (await searchParams).ancho === "58" ? 58 : 80;
  const c = await db.storeCredit.findUnique({
    where: { id: creditId },
    include: { client: { select: { businessName: true } }, originSale: { select: { number: true, originalSale: { select: { number: true } }, branch: { select: { name: true } } } } },
  });
  if (!c) notFound();
  const mm = PRINTABLE_MM[width];

  return (
    <div className="flex flex-col items-center">
      <style>{`@page { size: ${width}mm auto; margin: 2mm 4mm; }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 print:hidden">
        {([58, 80] as const).map((w) => (
          <Button key={w} asChild variant={w === width ? "default" : "outline"} size="sm">
            <Link href={`?ancho=${w}`}>{w} mm</Link>
          </Button>
        ))}
        <PrintButton />
      </div>
      <div className="box-content flex flex-col items-center gap-2 border border-dashed border-black/30 bg-white p-2 text-center text-black print:border-0 print:p-0" style={{ width: `${mm}mm` }}>
        <BrandLogo className="h-auto w-[70%]" priority />
        <p className="text-sm font-bold tracking-widest">VALE DE CAMBIO</p>
        <p className="text-[11px]">Saldo a favor para usar en cualquier compra</p>
        <p className="my-1 rounded border-2 border-black px-2 py-1 font-mono text-xl font-bold tracking-wider">{c.code}</p>
        <p className="text-lg font-bold">{formatMoney(c.balance.toNumber())}</p>
        {!c.balance.equals(c.amount) && <p className="text-[11px]">Importe original {formatMoney(c.amount.toNumber())}</p>}
        <div className="w-full border-t border-dashed border-black pt-1 text-left text-[11px] leading-snug">
          <p>Vale N° {c.number} · {date.format(c.createdAt)}</p>
          {c.client && <p>Cliente: {c.client.businessName}</p>}
          {c.originSale && (
            <p>
              Devolución #{c.originSale.number}
              {c.originSale.originalSale ? ` (venta #${c.originSale.originalSale.number})` : ""}
              {c.originSale.branch ? ` · ${c.originSale.branch.name}` : ""}
            </p>
          )}
          {c.expiresAt && <p>Vence: {c.expiresAt.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p>}
          {c.status !== "ACTIVO" && <p className="font-bold">{c.status === "USADO" ? "VALE USADO" : "VALE ANULADO"}</p>}
        </div>
        <p className="text-[10px]">Presentá este vale en caja. No se canjea por dinero.</p>
      </div>
    </div>
  );
}
