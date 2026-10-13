import { CalendarClock, FileText, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LeadStatusSelect } from "@/components/crm/lead-actions";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Input } from "@/components/ui/input";
import { LeadStatus } from "@/generated/prisma/enums";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { LEAD_STATUS_LABELS } from "@/lib/masters/labels";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { listLeads } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Oportunidades" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; mias?: string; aviso?: string }> };

export default async function LeadsBoardPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const mine = sp.mias === "1";
  const leads = await listLeads(q, mine ? user.id : null);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.crmWrite);
  const open = leads.filter((l) => l.status !== "GANADO" && l.status !== "PERDIDO");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">
            {open.length} abiertas por <strong className="text-foreground">{formatMoney(open.reduce((a, l) => a + (l.estimatedValue ?? 0), 0), { round: true })}</strong> ·
            ganadas y perdidas de los últimos 90 días
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/crm/oportunidades/nueva">
              <Plus /> Nueva oportunidad
            </Link>
          </Button>
        )}
      </div>
      <FlashNotice message={sp.aviso} />
      <form role="search" action="/crm/oportunidades" className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={q ?? ""} placeholder="Contacto o empresa…" aria-label="Buscar oportunidad" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="mias" value="1" defaultChecked={mine} className="size-4 accent-primary" /> Solo las mías
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="grid grid-flow-col auto-cols-[minmax(208px,1fr)] gap-3 overflow-x-auto pb-2">
        {Object.values(LeadStatus).map((status) => {
          const col = leads.filter((l) => l.status === status);
          const total = col.reduce((a, l) => a + (l.estimatedValue ?? 0), 0);
          return (
            <section key={status} aria-labelledby={`col-${status}`} className="flex min-h-48 flex-col gap-2 rounded-lg border bg-muted/30 p-2">
              <header className="flex items-baseline justify-between gap-2 px-1 pt-1">
                <h2 id={`col-${status}`} className="text-sm font-semibold">
                  {LEAD_STATUS_LABELS[status]} <span className="font-normal text-muted-foreground">({col.length})</span>
                </h2>
                {total > 0 && <span className="font-mono text-xs text-muted-foreground">{formatMoney(total, { round: true })}</span>}
              </header>
              {col.map((l) => {
                const overdue = l.overdue;
                return (
                  <article key={l.id} className="flex flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-xs">
                    <Link href={`/crm/oportunidades/${l.id}`} className="font-medium leading-snug underline-offset-4 hover:underline">
                      {l.company ?? l.name}
                    </Link>
                    {l.company && <span className="-mt-1.5 text-xs text-muted-foreground">{l.name}</span>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {l.estimatedValue !== null && <span className="font-mono text-foreground">{formatMoney(l.estimatedValue, { round: true })}</span>}
                      {l.expectedClose && (
                        <span className={cn("flex items-center gap-1", overdue && "font-medium text-destructive")}>
                          <CalendarClock aria-hidden="true" className="size-3" /> {new Date(l.expectedClose).toLocaleDateString("es-AR")}
                        </span>
                      )}
                      {l.quotes > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText aria-hidden="true" className="size-3" /> {l.quotes}
                        </span>
                      )}
                      {l.ownerName && <span>{l.ownerName.split(" ")[0]}</span>}
                    </div>
                    {canWrite && <LeadStatusSelect id={l.id} status={l.status} name={l.company ?? l.name} />}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
