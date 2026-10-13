import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { QuoteForm } from "@/components/crm/quote-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getQuoteFormData } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Nuevo presupuesto" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ cliente?: string; oportunidad?: string }> };

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export default async function NewQuotePage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.quotesWrite);
  const sp = await searchParams;
  const data = await getQuoteFormData();
  const client = data.clients.find((c) => c.id === sp.cliente);
  const lead = data.leads.find((l) => l.id === sp.oportunidad);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/crm/presupuestos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Presupuestos
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo presupuesto</h1>
        <p className="text-sm text-muted-foreground">Precios netos (sin IVA); el IVA se discrimina al pie. Los productos traen su precio de lista, que podés modificar.</p>
      </div>
      <QuoteForm
        data={data}
        initial={{
          id: null,
          clientId: client?.id ?? lead?.clientId ?? null,
          leadId: lead?.id ?? null,
          validUntil: inDays(15),
          paymentTerms: client ? (client.paymentTermDays > 0 ? `Cuenta corriente a ${client.paymentTermDays} días` : "Contado contra entrega") : "50% de anticipo, saldo contra entrega",
          deliveryTerms: "20 días hábiles desde la aprobación y el anticipo",
          notes: "",
          items: [],
        }}
      />
    </div>
  );
}
