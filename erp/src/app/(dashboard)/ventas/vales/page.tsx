import { ChevronLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Vales" };
export const dynamic = "force-dynamic";

const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const STATUS: Record<string, { label: string; variant: "success" | "outline" | "accent" }> = {
  ACTIVO: { label: "Con saldo", variant: "success" },
  USADO: { label: "Usado", variant: "outline" },
  ANULADO: { label: "Anulado", variant: "outline" },
};

type Props = { searchParams: Promise<{ q?: string; todos?: string }> };

/** Vales de cambio emitidos: saldo pendiente (deuda con clientes) y uso. */
export default async function StoreCreditsPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.posSell);
  const { q, todos } = await searchParams;
  const term = q?.trim() ?? "";
  const all = todos === "1" || term !== "";
  const [credits, outstanding] = await Promise.all([
    db.storeCredit.findMany({
      where: {
        ...(all ? {} : { status: "ACTIVO" }),
        ...(term ? { OR: [{ code: { contains: term.toUpperCase() } }, { client: { businessName: { contains: term, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        client: { select: { businessName: true } },
        originSale: { select: { id: true, number: true } },
        payments: { where: { method: "VALE", sale: { kind: "VENTA" } }, select: { sale: { select: { id: true, number: true, status: true } } } },
      },
    }),
    db.storeCredit.aggregate({ where: { status: "ACTIVO" }, _sum: { balance: true }, _count: true }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/ventas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Ventas y comprobantes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Vales de cambio</h1>
        <p className="text-sm text-muted-foreground">
          Se emiten al hacer una devolución con reintegro &quot;Vale / saldo a favor&quot; y se usan en el POS como medio de pago. {outstanding._count} vales con saldo por{" "}
          <strong>{formatMoney(outstanding._sum.balance?.toNumber() ?? 0)}</strong>.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{all ? "Todos los vales" : "Vales con saldo"}</CardTitle>
          <CardDescription>Buscá por código o cliente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action="/ventas/vales" className="flex flex-wrap gap-2">
            <Input name="q" defaultValue={term} placeholder="Código o cliente" className="w-64" aria-label="Buscar vale" />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
            <Button asChild variant="ghost">
              <Link href={all ? "/ventas/vales" : "/ventas/vales?todos=1"}>{all ? "Solo con saldo" : "Ver también usados"}</Link>
            </Button>
          </form>
          {credits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay vales.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Usado en</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.code}</TableCell>
                      <TableCell>{date.format(c.createdAt)}</TableCell>
                      <TableCell>{c.client?.businessName ?? <span className="text-muted-foreground">Consumidor final</span>}</TableCell>
                      <TableCell>
                        {c.originSale ? (
                          <Link href={`/ventas/${c.originSale.id}`} className="underline underline-offset-4">
                            Devolución #{c.originSale.number}
                          </Link>
                        ) : (
                          (c.notes ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(c.amount.toNumber())}</TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{formatMoney(c.balance.toNumber())}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS[c.status]?.variant ?? "outline"}>{STATUS[c.status]?.label ?? c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.payments.length
                          ? c.payments.map((p, i) =>
                              p.sale ? (
                                <Link key={i} href={`/ventas/${p.sale.id}`} className={`mr-2 underline underline-offset-4 ${p.sale.status === "ANULADA" ? "line-through" : ""}`}>
                                  #{p.sale.number}
                                </Link>
                              ) : null,
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon" aria-label={`Imprimir vale ${c.code}`}>
                          <Link href={`/pos/vales/${c.id}`} target="_blank">
                            <Printer />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
