import { ChevronLeft, FilePlus2, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConvertLeadButton } from "@/components/crm/lead-actions";
import { LeadForm } from "@/components/crm/lead-form";
import { LeadStatusBadge, QuoteStatusBadge } from "@/components/crm/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { getLead, getLeadFormData } from "@/server/queries/crm.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await getLead((await params).id);
  return { title: l ? (l.form.company ?? l.form.name) : "Oportunidad" };
}

export default async function LeadPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const { id } = await params;
  const [lead, data] = await Promise.all([getLead(id), getLeadFormData()]);
  if (!lead) notFound();
  const { aviso } = await searchParams;
  const can = (p: string) => hasPermission(user.permissions, p);
  const f = lead.form;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/crm/oportunidades" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> Oportunidades
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {f.company ?? f.name} <LeadStatusBadge status={f.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Creada el {new Date(lead.createdAt).toLocaleDateString("es-AR")}
            {lead.clientName && (
              <>
                {" "}· cliente{" "}
                <Link href={`/crm/clientes/${f.clientId}`} className="underline underline-offset-4">
                  {lead.clientName}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.whatsapp && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/${lead.whatsapp}`} target="_blank" rel="noreferrer noopener">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {!f.clientId && can(PERMISSIONS.crmWrite) && <ConvertLeadButton leadId={id} />}
          {can(PERMISSIONS.quotesWrite) && (
            <Button asChild size="sm">
              <Link href={`/crm/presupuestos/nuevo?oportunidad=${id}`}>
                <FilePlus2 /> Presupuestar
              </Link>
            </Button>
          )}
        </div>
      </div>
      <FlashNotice message={aviso} />
      {lead.quotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {lead.quotes.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3">
                  <Link href={`/crm/presupuestos/${q.id}`} className="underline-offset-4 hover:underline">
                    N° {q.number} · {new Date(q.date).toLocaleDateString("es-AR")}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{formatMoney(q.total)}</span> <QuoteStatusBadge status={q.status} />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <LeadForm initial={f} clients={data.clients} users={data.users} readOnly={!can(PERMISSIONS.crmWrite)} />
    </div>
  );
}
