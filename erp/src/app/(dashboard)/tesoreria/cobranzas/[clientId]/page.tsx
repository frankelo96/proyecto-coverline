import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReceiptForm } from "@/components/treasury/receipt-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/purchasing/math";
import { CHEQUE_STATUS_LABELS } from "@/lib/treasury/cheques";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getClientAccount } from "@/server/queries/treasury.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ clientId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clientId } = await params;
  const a = await getClientAccount(clientId);
  return { title: a ? `Cuenta ${a.client.name}` : "Cuenta corriente" };
}

export default async function ClientAccountPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.receivablesCollect);
  const { clientId } = await params;
  const a = await getClientAccount(clientId);
  if (!a) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/tesoreria/cobranzas" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Cobranzas
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {a.client.document ?? "Sin documento"}
          {a.client.phone && ` · ${a.client.phone}`} · límite {formatMoney(a.client.creditLimit, { round: true })} · plazo {a.client.paymentTermDays} días
        </p>
        <h2 className="text-2xl font-bold">{a.client.name}</h2>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 rounded-lg bg-ink p-4 text-ink-foreground sm:col-span-1">
          <dt className="text-xs text-ink-muted">Saldo a cobrar</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(a.balance)}</dd>
        </div>
        {AGING_BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{AGING_LABELS[b]}</dt>
            <dd className={cn("font-mono text-lg font-semibold tabular-nums", a.aging[b] > 0 && b !== "A_VENCER" && "text-destructive")}>{formatMoney(a.aging[b], { round: true })}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Cobrar</CardTitle>
        </CardHeader>
        <ReceiptForm account={a} />
      </Card>

      {a.cheques.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cheques entregados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {a.cheques.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {c.label} · vto. {new Date(c.paymentDate).toLocaleDateString("es-AR")}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={c.status === "RECHAZADO" ? "destructive" : "outline"}>{CHEQUE_STATUS_LABELS[c.status]}</Badge>
                    <span className="font-mono tabular-nums">{formatMoney(c.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Extracto</CardTitle>
        </CardHeader>
        <Table className="min-w-[640px]">
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
            {a.lines.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Sin movimientos.
                </TableCell>
              </TableRow>
            )}
            {a.lines.map((l) => (
              <TableRow key={l.key}>
                <TableCell className="pl-5 whitespace-nowrap">{new Date(l.at).toLocaleDateString("es-AR")}</TableCell>
                <TableCell>
                  {l.href ? (
                    <Link href={l.href} target="_blank" className="underline-offset-4 hover:underline">
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
