import { ChevronLeft, Factory, FilePlus2, Mail, MessageCircle, Pencil, Phone, Target, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientDesigns } from "@/components/crm/design-form";
import { LeadStatusBadge, QuoteStatusBadge } from "@/components/crm/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { MONTH_OPTIONS } from "@/lib/masters/fields";
import { CLIENT_TYPE_LABELS } from "@/lib/masters/labels";
import { STAGE_LABELS } from "@/lib/production/workflow";
import { TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getClient360 } from "@/server/queries/crm.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getClient360((await params).id);
  return { title: c?.name ?? "Cliente" };
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "—");
const ORDER_STATUS: Record<string, string> = { BORRADOR: "Pendiente", EN_PROCESO: "En proceso", COMPLETADA: "Terminada", CANCELADA: "Cancelada" };

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border bg-card px-4 py-3", tone === "warn" && "border-destructive/40")}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-xl font-semibold tabular-nums", tone === "warn" && "text-destructive")}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default async function Client360Page({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const { id } = await params;
  const c = await getClient360(id);
  if (!c) notFound();
  const { aviso } = await searchParams;
  const can = (p: string) => hasPermission(user.permissions, p);
  const k = c.kpis;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/crm/clientes" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> Clientes
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Badge>{CLIENT_TYPE_LABELS[c.type]}</Badge>
            <Badge variant="outline">{TAX_CONDITION_LABELS[c.taxCondition]}</Badge>
            {!c.active && <Badge variant="destructive">Inactivo</Badge>}
            {c.tags.map((t) => (
              <Badge key={t} variant="accent">
                {t}
              </Badge>
            ))}
            {c.document && <span className="ml-1 font-mono">{c.document}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.whatsapp && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer noopener">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {c.email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${c.email}`}>
                <Mail /> Email
              </a>
            </Button>
          )}
          {can(PERMISSIONS.crmWrite) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/crm/clientes/${c.id}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
          )}
          {can(PERMISSIONS.crmWrite) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/crm/oportunidades/nueva?cliente=${c.id}`}>
                <Target /> Nueva oportunidad
              </Link>
            </Button>
          )}
          {can(PERMISSIONS.productionWrite) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/produccion/ordenes/nueva?cliente=${c.id}`}>
                <Factory /> Orden de producción
              </Link>
            </Button>
          )}
          {can(PERMISSIONS.quotesWrite) && (
            <Button asChild size="sm">
              <Link href={`/crm/presupuestos/nuevo?cliente=${c.id}`}>
                <FilePlus2 /> Nuevo presupuesto
              </Link>
            </Button>
          )}
        </div>
      </div>

      <FlashNotice message={aviso} />

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Compras 12 meses" value={formatMoney(k.yearTotal, { round: true })} hint={`${k.yearCount} compras`} />
        <Kpi label="Ticket promedio" value={formatMoney(k.avgTicket, { round: true })} />
        <Kpi label="Última compra" value={date(k.lastPurchase)} hint={k.daysSinceLastPurchase !== null ? `hace ${k.daysSinceLastPurchase} días` : "Nunca compró"} />
        <Kpi label="Saldo cuenta corriente" value={formatMoney(k.balance)} hint={k.overdue > 0 ? `${formatMoney(k.overdue)} vencido` : "Sin deuda vencida"} tone={k.overdue > 0 ? "warn" : undefined} />
        <Kpi
          label="Crédito disponible"
          value={k.availableCredit === null ? "Sin crédito" : formatMoney(k.availableCredit)}
          hint={c.creditLimit > 0 ? `Límite ${formatMoney(c.creditLimit, { round: true })} · ${c.paymentTermDays} días` : undefined}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contacto y datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {c.fantasyName && (
                <>
                  <dt className="text-muted-foreground">Fantasía</dt>
                  <dd>{c.fantasyName}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd>
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                    <Phone aria-hidden="true" className="size-3.5" /> {c.phone}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">WhatsApp</dt>
              <dd>{c.whatsappRaw ?? "—"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{c.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Dirección</dt>
              <dd>{c.address ?? "—"}</dd>
              <dt className="text-muted-foreground">Compra en</dt>
              <dd>{c.purchaseMonths.length ? c.purchaseMonths.map((m) => MONTH_OPTIONS[m - 1]?.label).join(", ") : "—"}</dd>
              <dt className="text-muted-foreground">Cliente desde</dt>
              <dd>{date(c.createdAt)}</dd>
            </dl>
            {c.notes && <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm whitespace-pre-line">{c.notes}</p>}
            {can(PERMISSIONS.receivablesCollect) && (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href={`/tesoreria/cobranzas/${c.id}`}>
                  <Wallet /> Cuenta corriente y cobranzas
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lo que más compra</CardTitle>
          </CardHeader>
          <CardContent>
            {c.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay compras registradas.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {c.topProducts.map((p) => (
                  <li key={p.name} className="flex justify-between gap-3">
                    <span>
                      {p.name} <span className="text-muted-foreground">× {formatNumber(p.quantity)}</span>
                    </span>
                    <span className="font-mono tabular-nums">{formatMoney(p.total, { round: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logos y diseños</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientDesigns clientId={c.id} designs={c.designs} canWrite={can(PERMISSIONS.crmWrite)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <Table>
              <TableBody>
                {c.quotes.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-5 py-6 text-center text-sm text-muted-foreground">Sin presupuestos.</TableCell>
                  </TableRow>
                )}
                {c.quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="pl-5">
                      <Link href={`/crm/presupuestos/${q.id}`} className="font-mono underline-offset-4 hover:underline">
                        N° {q.number}
                      </Link>
                    </TableCell>
                    <TableCell>{date(q.date)}</TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(q.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Oportunidades y producción</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {c.leads.length === 0 && c.orders.length === 0 && <p className="text-sm text-muted-foreground">Sin oportunidades ni órdenes de producción.</p>}
            {c.leads.length > 0 && (
              <ul className="flex flex-col gap-2 text-sm">
                {c.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3">
                    <Link href={`/crm/oportunidades/${l.id}`} className="underline-offset-4 hover:underline">
                      {l.name}
                    </Link>
                    <span className="flex items-center gap-2">
                      {l.estimatedValue !== null && <span className="font-mono text-xs">{formatMoney(l.estimatedValue, { round: true })}</span>}
                      <LeadStatusBadge status={l.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {c.orders.length > 0 && (
              <ul className="flex flex-col gap-2 border-t pt-3 text-sm">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3">
                    <Link href={`/produccion/ordenes/${o.id}`} className="underline-offset-4 hover:underline">
                      OP {o.number} · {o.product} × {o.quantity}
                    </Link>
                    <Badge variant={o.status === "COMPLETADA" ? "success" : "outline"}>
                      {o.status === "EN_PROCESO" ? STAGE_LABELS[o.stage] : ORDER_STATUS[o.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas compras</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 py-0">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Fecha</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Ítems</TableHead>
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.sales.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Sin compras registradas.
                  </TableCell>
                </TableRow>
              )}
              {c.sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-5">{date(s.date)}</TableCell>
                  <TableCell>
                    <Link href={`/ventas/${s.id}`} className="underline-offset-4 hover:underline">
                      {s.voucher}
                    </Link>
                    {s.kind === "DEVOLUCION" && (
                      <Badge variant="accent" className="ml-2">
                        Devolución
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{s.branch ?? "—"}</TableCell>
                  <TableCell className="text-right">{s.items}</TableCell>
                  <TableCell className={cn("pr-5 text-right font-mono tabular-nums", s.kind === "DEVOLUCION" && "text-destructive")}>
                    {s.kind === "DEVOLUCION" ? "−" : ""}
                    {formatMoney(s.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
