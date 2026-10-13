import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { QuoteForm } from "@/components/crm/quote-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isEditableQuote } from "@/lib/crm/quote-math";
import { requirePageUser } from "@/server/auth/session";
import { getQuoteDetail, getQuoteFormData } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Editar presupuesto" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
const decimalText = (v: number) => String(v).replace(".", ",");

export default async function EditQuotePage({ params }: Props) {
  await requirePageUser(PERMISSIONS.quotesWrite);
  const { id } = await params;
  const [q, data] = await Promise.all([getQuoteDetail(id), getQuoteFormData()]);
  if (!q) notFound();
  if (!isEditableQuote(q.status)) redirect(`/crm/presupuestos/${id}`);
  const productLabel = new Map(data.products.map((p) => [p.id, `${p.sku} — ${p.name}`]));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/crm/presupuestos/${id}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Presupuesto N° {q.number}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Editar presupuesto N° {q.number}</h1>
      </div>
      <QuoteForm
        data={data}
        initial={{
          id: q.id,
          clientId: q.client?.id ?? null,
          leadId: q.lead?.id ?? null,
          validUntil: q.validUntil.slice(0, 10),
          paymentTerms: q.paymentTerms ?? "",
          deliveryTerms: q.deliveryTerms ?? "",
          notes: q.notes ?? "",
          items: q.items.map((i) => ({
            productId: i.productId,
            productText: (i.productId && productLabel.get(i.productId)) || "",
            description: i.description,
            quantity: decimalText(i.quantity),
            unitPrice: decimalText(i.unitPrice),
            discountPct: decimalText(i.discountPct),
            vatRate: String(i.vatRate),
          })),
        }}
      />
    </div>
  );
}
