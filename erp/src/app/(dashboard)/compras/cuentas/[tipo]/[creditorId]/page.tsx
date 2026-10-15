import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ExportButtons } from "@/components/documents/export-buttons";
import { PaymentOrderForm } from "@/components/purchasing/payment-order-form";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/purchasing/math";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getCreditorStatement, type CreditorType } from "@/server/queries/purchasing.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipo: string; creditorId: string }> };

const isType = (t: string): t is CreditorType => t === "proveedor" || t === "taller";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo, creditorId } = await params;
  const s = isType(tipo) ? await getCreditorStatement(tipo, creditorId) : null;
  return { title: s ? `Cuenta ${s.name}` : "Cuenta corriente" };
}

export default async function CreditorStatementPage({ params }: Props) {
  const user = await requirePageUser(PERMISSIONS.payablesRead);
  const { tipo, creditorId } = await params;
  if (!isType(tipo)) notFound();
  const s = await getCreditorStatement(tipo, creditorId);
  if (!s) notFound();
  const canPay = hasPermission(user.permissions, PERMISSIONS.payablesPay);
  const overdue = s.balance - s.aging.A_VENCER;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/compras/cuentas" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Cuentas a pagar
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted-foreground">
          {tipo === "taller" ? "Taller" : "Proveedor"}
          {s.cuit && ` · CUIT ${s.cuit}`}
          {s.phone && ` · ${s.phone}`} · pago a {s.paymentTermDays} días
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{s.name}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {tipo === "proveedor" && hasPermission(user.permissions, PERMISSIONS.purchasesWrite) && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/compras/notas-credito/nueva?proveedor=${s.id}`}>Cargar nota de crédito</Link>
          </Button>
        )}
        <ExportButtons report="acreedor-extracto" params={{ tipo, id: s.id }} label="Exportar extracto" />
      </div>
      </div>

      {!!s.credits?.length && (
        <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm">
          <strong>Saldo a favor con {s.name}: {formatMoney(s.credits.reduce((a, c) => a + c.balance, 0))}</strong>
          <span className="text-muted-foreground"> — se usa en la orden de pago con el medio «Saldo a favor».</span>
          <ul className="mt-1 text-xs text-muted-foreground">
            {s.credits.map((c) => (
              <li key={c.id}>
                #{c.number} · {c.origin === "ANTICIPO" ? "Anticipo" : c.origin === "NOTA_CREDITO" ? "Nota de crédito" : "Pago de más"} · {formatMoney(c.balance)}
                {c.notes ? ` · ${c.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <div className="col-span-2 rounded-lg bg-ink p-4 text-ink-foreground sm:col-span-1 lg:col-span-2">
          <dt className="text-xs text-ink-muted">Saldo a pagar</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(s.balance)}</dd>
          {overdue > 0 && <dd className="text-xs text-accent">Vencido {formatMoney(overdue)}</dd>}
        </div>
        {AGING_BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{AGING_LABELS[b]}</dt>
            <dd className={cn("font-mono text-lg font-semibold tabular-nums", s.aging[b] > 0 && b !== "A_VENCER" && "text-destructive")}>
              {formatMoney(s.aging[b], { round: true })}
            </dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>{canPay ? "Comprobantes pendientes y orden de pago" : "Comprobantes pendientes"}</CardTitle>
          {tipo === "taller" && (
            <CardDescription>Las deudas provisorias salen de cada recepción con remito; se reemplazan cuando cargás la factura del taller.</CardDescription>
          )}
        </CardHeader>
        <PaymentOrderForm statement={s} canPay={canPay} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extracto de cuenta</CardTitle>
        </CardHeader>
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="pr-5 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.lines.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Sin movimientos.
                </TableCell>
              </TableRow>
            )}
            {s.lines.map((l) => (
              <TableRow key={l.key}>
                <TableCell className="pl-5 whitespace-nowrap">{new Date(l.date).toLocaleDateString("es-AR")}</TableCell>
                <TableCell>
                  {l.href ? (
                    <Link href={l.href} className="underline-offset-4 hover:underline" target={l.kind === "PAGO" ? "_blank" : undefined}>
                      {l.description}
                    </Link>
                  ) : (
                    l.description
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{l.debit ? formatMoney(l.debit) : ""}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-success">{l.credit ? formatMoney(l.credit) : ""}</TableCell>
                <TableCell className="pr-5 text-right font-mono font-medium tabular-nums">{formatMoney(l.running)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
