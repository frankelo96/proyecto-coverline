import { ChevronLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ARCA_BADGE } from "@/components/sales/arca-badge";
import { AuthorizeButton } from "@/components/sales/authorize-button";
import { ReturnForm } from "@/components/sales/return-form";
import { ExchangeForm, VoidSaleForm } from "@/components/sales/sale-actions";
import { Badge } from "@/components/ui/badge";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSaleDetail } from "@/server/queries/sales.queries";
import { BRANCH_ORDER } from "@/server/services/stock.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ saleId: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { saleId } = await params;
  const s = await getSaleDetail(saleId);
  return { title: s ? `Venta #${s.number}` : "Venta" };
}

const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

export default async function SaleDetailPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.posSell);
  const { saleId } = await params;
  const s = await getSaleDetail(saleId);
  if (!s) notFound();
  const { aviso } = await searchParams;
  const isReturn = s.kind === "DEVOLUCION";
  const fiscal = s.invoiceType !== "TICKET_INTERNO";
  const voided = s.status === "ANULADA";
  const canExchange = !isReturn && !voided && hasPermission(user.permissions, PERMISSIONS.posReturn) && s.items.some((i) => i.returnable > 0 && i.exchangeOptions.length > 0);
  const canVoid = !s.voidBlocker && hasPermission(user.permissions, PERMISSIONS.posVoid);
  const branches = canExchange ? await db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER, select: { id: true, name: true } }) : [];
  const canReturn =
    !isReturn && !voided && hasPermission(user.permissions, PERMISSIONS.posReturn) && s.items.some((i) => i.returnable > 0) && (!fiscal || s.arca.status === "AUTORIZADO");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/ventas" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Ventas y comprobantes
      </Link>
      <FlashNotice message={aviso} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm text-muted-foreground">
            {isReturn ? "Devolución" : "Venta"} #{s.number} · {dt(s.date)} · {s.branchName} · {s.cashier}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {s.voucher}
            {voided && <Badge variant="destructive">Anulada</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {s.client ? (
              <Link href={`/tesoreria/cobranzas/${s.client.id}`} className="underline underline-offset-4">
                {s.client.businessName}
              </Link>
            ) : (
              "Consumidor final"
            )}
            {s.original && (
              <>
                {" · sobre "}
                <Link href={`/ventas/${s.original.id}`} className="underline underline-offset-4">
                  venta #{s.original.number} ({s.original.voucher})
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/pos/tickets/${s.id}?ancho=80`} target="_blank">
              <Printer /> Ticket 80 mm
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/pos/tickets/${s.id}?ancho=58`} target="_blank">
              <Printer /> 58 mm
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{isReturn ? "Artículos devueltos" : "Artículos"}</CardTitle>
            </CardHeader>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Artículo</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="pr-5 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="pl-5">
                      {i.description}
                      {i.discountPct > 0 && <span className="block text-xs text-muted-foreground">Descuento {formatNumber(i.discountPct)}%</span>}
                      {isReturn && <span className="block text-xs text-muted-foreground">{i.restocked ? "Volvió al stock" : "No vuelve al stock"}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatNumber(i.quantity)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.unitPrice)}</TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(i.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {canReturn && (
            <Card>
              <CardHeader>
                <CardTitle>Devolución {fiscal && "/ nota de crédito"}</CardTitle>
              </CardHeader>
              <ReturnForm sale={s} />
            </Card>
          )}
          {canExchange && (
            <Card>
              <CardHeader>
                <CardTitle>Cambio de talle</CardTitle>
              </CardHeader>
              <CardContent>
                <ExchangeForm sale={s} branches={branches} defaultBranchId={user.branchId ?? s.branchId ?? branches[0]?.id ?? ""} lockedBranch={!!user.branchId} />
              </CardContent>
            </Card>
          )}
          {canVoid && (
            <Card>
              <CardHeader>
                <CardTitle>Anular venta</CardTitle>
              </CardHeader>
              <CardContent>
                <VoidSaleForm saleId={s.id} number={s.number} />
              </CardContent>
            </Card>
          )}
          {!isReturn && !voided && !canVoid && s.voidBlocker && hasPermission(user.permissions, PERMISSIONS.posVoid) && (
            <p className="text-sm text-muted-foreground">No se puede anular: {s.voidBlocker.charAt(0).toLowerCase() + s.voidBlocker.slice(1)}.</p>
          )}
          {!isReturn && !voided && fiscal && s.arca.status !== "AUTORIZADO" && (
            <p className="text-sm text-muted-foreground">Para devolver mercadería de esta factura primero tiene que estar autorizada por ARCA.</p>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              {s.priceListName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lista de precios</span>
                  <span>{s.priceListName}</span>
                </div>
              )}
              {s.discountTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descuentos ({s.discountReason})</span>
                  <span className="font-mono">-{formatMoney(s.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Neto</span>
                <span className="font-mono">{formatMoney(s.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-mono">{formatMoney(s.taxTotal)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="font-mono">{formatMoney(s.total)}</span>
              </div>
              <div className="border-t pt-2">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{isReturn ? "Reintegro" : "Cobro"}</p>
                {s.payments.map((p, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-x-2">
                    <span>
                      {METHOD_LABELS[p.method]}
                      {p.detail && <span className="text-muted-foreground"> · {p.detail}</span>}
                    </span>
                    <span className="font-mono">{formatMoney(p.amount)}</span>
                    {p.storeCreditId && isReturn && (
                      <Link href={`/pos/vales/${p.storeCreditId}`} target="_blank" className="basis-full text-xs underline underline-offset-4">
                        Imprimir vale
                      </Link>
                    )}
                  </div>
                ))}
                {s.change > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Vuelto</span>
                    <span className="font-mono">{formatMoney(s.change)}</span>
                  </div>
                )}
              </div>
              {isReturn && s.returnReason && <p className="border-t pt-2 text-muted-foreground">Motivo: {s.returnReason}</p>}
            </CardContent>
          </Card>

          {fiscal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  ARCA <Badge variant={ARCA_BADGE[s.arca.status].variant}>{ARCA_BADGE[s.arca.status].label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {s.arca.cae && (
                  <p>
                    CAE <span className="font-mono">{s.arca.cae}</span>
                    {s.arca.caeDueDate && ` · vence ${new Date(s.arca.caeDueDate).toLocaleDateString("es-AR")}`}
                  </p>
                )}
                {s.arca.error && <p className="text-destructive">{s.arca.error}</p>}
                {s.arca.observations.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {s.arca.observations.map((o, i) => (
                      <li key={i}>
                        {o.code}: {o.message}
                      </li>
                    ))}
                  </ul>
                )}
                {s.arca.attempts > 0 && <p className="text-xs text-muted-foreground">Intentos: {s.arca.attempts}</p>}
                {s.arca.status !== "AUTORIZADO" &&
                  (s.arca.enabled ? <AuthorizeButton saleId={s.id} /> : <p className="text-xs text-muted-foreground">Configurá ARCA_MODE, ARCA_CUIT, ARCA_CERT y ARCA_KEY para autorizar.</p>)}
              </CardContent>
            </Card>
          )}

          {s.returns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Devoluciones</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y text-sm">
                  {s.returns.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 py-2">
                      <Link href={`/ventas/${r.id}`} className="underline-offset-4 hover:underline">
                        #{r.number} · {r.voucher}
                      </Link>
                      <span className="font-mono text-destructive">-{formatMoney(r.total)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
