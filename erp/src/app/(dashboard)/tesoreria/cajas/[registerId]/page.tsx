import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { METHOD_LABELS, MOVEMENT_LABELS, REGISTER_KIND_LABELS } from "@/lib/treasury/cash";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getRegisterDetail } from "@/server/queries/treasury.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ registerId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { registerId } = await params;
  const d = await getRegisterDetail(registerId);
  return { title: d?.register.name ?? "Caja" };
}

const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

export default async function RegisterDetailPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.cashRead);
  const { registerId } = await params;
  const d = await getRegisterDetail(registerId);
  if (!d) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/tesoreria" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Cajas y cuentas
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {REGISTER_KIND_LABELS[d.register.kind]}
            {d.register.branchName && ` · ${d.register.branchName}`}
          </p>
          <h2 className="text-2xl font-bold">{d.register.name}</h2>
        </div>
        <p className={cn("font-mono text-3xl font-semibold tabular-nums", d.balance < 0 && "text-destructive")}>{formatMoney(d.balance)}</p>
      </div>

      {d.register.requiresSession && d.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Turnos</CardTitle>
          </CardHeader>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Apertura</TableHead>
                <TableHead>Cierre</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="pr-5">
                  <span className="sr-only">Arqueo</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-5">
                    {dt(s.openedAt)} <span className="text-muted-foreground">· {s.openedBy}</span>
                  </TableCell>
                  <TableCell>{s.closedAt ? `${dt(s.closedAt)} · ${s.closedBy}` : <Badge variant="success">Abierto</Badge>}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{s.declaredAmount !== null ? formatMoney(s.declaredAmount) : "—"}</TableCell>
                  <TableCell className={cn("text-right font-mono tabular-nums", (s.difference ?? 0) < 0 && "text-destructive", (s.difference ?? 0) > 0 && "text-success")}>
                    {s.difference !== null ? formatMoney(s.difference) : "—"}
                  </TableCell>
                  <TableCell className="pr-5">
                    <Link href={`/tesoreria/turnos/${s.id}`} className="text-sm underline underline-offset-4" target="_blank">
                      Arqueo
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
        </CardHeader>
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="pr-5 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.movements.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin movimientos.
                </TableCell>
              </TableRow>
            )}
            {d.movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="pl-5 whitespace-nowrap">{dt(m.at)}</TableCell>
                <TableCell>
                  {MOVEMENT_LABELS[m.type]}
                  <span className="block text-xs text-muted-foreground">{METHOD_LABELS[m.method]}</span>
                </TableCell>
                <TableCell>{m.concept}</TableCell>
                <TableCell className="text-muted-foreground">{m.user}</TableCell>
                <TableCell className={cn("text-right font-mono tabular-nums", m.signed < 0 ? "text-destructive" : "text-success")}>{formatMoney(m.signed)}</TableCell>
                <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(m.balanceAfter)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
