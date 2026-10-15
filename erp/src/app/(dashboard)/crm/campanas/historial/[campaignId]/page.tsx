import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CampaignComposer } from "@/components/crm/campaign-composer";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getCampaign } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Campaña" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ campaignId: string }> };

export default async function CampaignDetailPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.crmRead);
  const c = await getCampaign((await params).campaignId);
  if (!c) notFound();
  const sent = Object.keys(c.sent).length;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/crm/campanas/historial" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Historial de campañas
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">{c.name}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(c.createdAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} · {c.clients.length} destinatarios · {sent} contactados · {c.bought.length}{" "}
          compraron dentro de los 30 días
        </p>
      </div>
      <CampaignComposer clients={c.clients} campaign={{ id: c.id, name: c.name, subject: c.subject, message: c.message, sent: c.sent }} bought={c.bought} />
    </div>
  );
}
