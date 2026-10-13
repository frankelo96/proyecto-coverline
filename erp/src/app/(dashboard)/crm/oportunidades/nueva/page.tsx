import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LeadForm } from "@/components/crm/lead-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getLeadFormData } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Nueva oportunidad" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ cliente?: string }> };

export default async function NewLeadPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmWrite);
  const { cliente } = await searchParams;
  const data = await getLeadFormData();
  const client = cliente ? await db.client.findUnique({ where: { id: cliente } }) : null;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/crm/oportunidades" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Oportunidades
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Nueva oportunidad</h1>
      </div>
      <LeadForm
        clients={data.clients}
        users={data.users}
        initial={{
          id: null,
          name: client ? (client.fantasyName ?? client.businessName) : "",
          company: client && client.type !== "PARTICULAR" ? client.businessName : null,
          email: client?.email ?? null,
          phone: client?.whatsapp ?? client?.phone ?? null,
          source: client ? "Cliente existente" : null,
          status: "NUEVO",
          estimatedValue: null,
          expectedClose: null,
          notes: null,
          lostReason: null,
          clientId: client?.id ?? null,
          ownerId: user.id,
        }}
      />
    </div>
  );
}
