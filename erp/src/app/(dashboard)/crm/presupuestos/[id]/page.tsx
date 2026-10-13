import { ChevronLeft, Factory, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConvertLeadButton } from "@/components/crm/lead-actions";
import { QuoteActions } from "@/components/crm/quote-actions";
import { QuoteStatusBadge } from "@/components/crm/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";
import { requirePageUser } from "@/server/auth/session";
import { getQuoteDetail } from "@/server/queries/crm.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const q = await getQuoteDetail((await params).id);
  return { title: q ? `Presupuesto N° ${q.number}` : "Presupuesto" };
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "—");

export default async function QuoteDetailPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const { id } = await params;
  const q = await getQuoteDetail(id);
  if (!q) notFound();
  const { aviso } = await searchParams;
  const can = (p: string) => hasPermission(user.permissions, p);
  const party = q.client?.name ?? q.lead?.company ?? q.lead?.name ?? "—";
  const contactName = q.lead?.name && !q.client ? q.lead.name : party;
  const message = `Hola ${contactName}! Te enviamos el presupuesto N° ${q.number} de Coverline Uniformes por ${formatMoney(q.total)} (IVA incluido), válido hasta el ${date(q.validUntil)}. Cualquier consulta, a disposición.`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/crm/presupuestos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> Presupuestos
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            Presupuesto N° {q.number} <QuoteStatusBadge status={q.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {date(q.createdAt)} · {q.userName} · válido hasta {date(q.validUntil)}
            {q.sentAt && ` · enviado ${date(q.sentAt)}`}
            {q.closedAt && ` · cerrado ${date(q.closedAt)}`}
          </p>
        </div>
        <QuoteActions
          id={q.id}
          status={q.status}
          canWrite={can(PERMISSIONS.quotesWrite)}
          whatsapp={q.client?.whatsapp ?? q.lead?.whatsapp ?? null}
          email={q.client?.email ?? q.lead?.email ?? null}
          message={message}
          subject={`Presupuesto N° ${q.number} — Coverline Uniformes`}
        />
      </div>

      <FlashNotice message={aviso} />

      {q.status === "ACEPTADO" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm">
          <span>Presupuesto aceptado. Próximo paso: cargar la producción o cobrar la seña en el POS.</span>
          <div className="flex flex-wrap gap-2">
            {!q.client && q.lead && can(PERMISSIONS.crmWrite) && <ConvertLeadButton leadId={q.lead.id} />}
            {can(PERMISSIONS.productionWrite) &&
              [...new Map(q.items.filter((i) => i.productId).map((i) => [i.productId!, i])).values()].map((i) => (
                <Button key={i.productId} asChild size="sm" variant="outline">
                  <Link
                    href={`/produccion/ordenes/nueva?${new URLSearchParams({
                      producto: i.productId!,
                      ...(q.client ? { cliente: q.client.id } : {}),
                      notas: `Presupuesto N° ${q.number}: ${formatNumber(i.quantity)} u. ${i.description}`.slice(0, 300),
                    })}`}
                  >
                    <Factory /> Orden de producción{q.items.filter((x) => x.productId).length > 1 ? `: ${i.sku}` : ""}
                  </Link>
                </Button>
              ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Ítems</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 py-0">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Descripción</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio neto</TableHead>
                  <TableHead className="text-right">Bonif.</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="pr-5 text-right">Subtotal neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="pl-5">
                      {i.sku && <span className="mr-2 font-mono text-xs text-muted-foreground">{i.sku}</span>}
                      <span className="whitespace-pre-line">{i.description}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(i.quantity)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.discountPct ? `${formatNumber(i.discountPct)}%` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(i.vatRate)}%</TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(i.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="ml-auto grid w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-5 py-4 text-sm">
              <dt className="text-muted-foreground">Subtotal neto</dt>
              <dd className="text-right font-mono tabular-nums">{formatMoney(q.subtotal)}</dd>
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="text-right font-mono tabular-nums">{formatMoney(q.taxTotal)}</dd>
              <dt className="border-t pt-1 font-semibold">Total</dt>
              <dd className="border-t pt-1 text-right font-mono text-base font-semibold tabular-nums">{formatMoney(q.total)}</dd>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{q.client ? "Cliente" : "Oportunidad"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {q.client ? (
                <>
                  <Link href={`/crm/clientes/${q.client.id}`} className="font-medium underline-offset-4 hover:underline">
                    {q.client.name}
                  </Link>
                  {q.client.document && <span className="font-mono text-xs">{q.client.document}</span>}
                  <span className="text-muted-foreground">{TAX_CONDITION_LABELS[q.client.taxCondition]}</span>
                  {q.client.address && <span className="text-muted-foreground">{q.client.address}</span>}
                  {q.client.email && <span className="break-all text-muted-foreground">{q.client.email}</span>}
                </>
              ) : q.lead ? (
                <>
                  <Link href={`/crm/oportunidades/${q.lead.id}`} className="font-medium underline-offset-4 hover:underline">
                    {q.lead.company ?? q.lead.name}
                  </Link>
                  {q.lead.company && <span>{q.lead.name}</span>}
                  {q.lead.email && <span className="break-all text-muted-foreground">{q.lead.email}</span>}
                  {can(PERMISSIONS.crmWrite) && q.status !== "ACEPTADO" && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserPlus aria-hidden="true" className="size-3.5" /> Al aceptarlo podés darlo de alta como cliente.
                    </p>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Condiciones</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                <dt className="text-xs text-muted-foreground uppercase">Forma de pago</dt>
                <dd>{q.paymentTerms ?? "—"}</dd>
                <dt className="text-xs text-muted-foreground uppercase">Entrega</dt>
                <dd>{q.deliveryTerms ?? "—"}</dd>
                {q.notes && (
                  <>
                    <dt className="text-xs text-muted-foreground uppercase">Observaciones</dt>
                    <dd className="whitespace-pre-line">{q.notes}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
