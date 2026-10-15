import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { endOfLocalDay, startOfLocalDay } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { BRANCH_ORDER, STOCK_MOVE_LABELS, type StockMoveReason } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Movimientos de stock" };
export const dynamic = "force-dynamic";

const LIMIT = 500;
const REF_LINKS: Record<string, string> = { VENTA: "/ventas/", COMPRA: "/compras/", OP: "/produccion/ordenes/" };
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

type Props = { searchParams: Promise<{ producto?: string; variante?: string; local?: string; motivo?: string; desde?: string; hasta?: string }> };

/** Kardex: cada entrada y salida de stock por local, con el saldo que quedó. */
export default async function StockMovementsPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.mastersRead);
  const sp = await searchParams;
  const [branches, products] = await Promise.all([
    db.branch.findMany({ orderBy: BRANCH_ORDER, select: { id: true, name: true } }),
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
  ]);
  const product = products.find((p) => p.id === sp.producto) ?? null;
  const variants = product
    ? (await db.productVariant.findMany({ where: { productId: product.id }, select: { id: true, size: true, color: true, fabric: true, sku: true } })).sort(
        (a, b) => (a.color ?? "").localeCompare(b.color ?? "", "es") || (a.fabric ?? "").localeCompare(b.fabric ?? "", "es") || compareSizes(a.size, b.size),
      )
    : [];
  const variant = variants.find((v) => v.id === sp.variante) ?? null;
  const reason = sp.motivo && sp.motivo in STOCK_MOVE_LABELS ? (sp.motivo as StockMoveReason) : null;
  const branch = branches.find((b) => b.id === sp.local) ?? null;
  const from = sp.desde && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : null;
  const to = sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) ? sp.hasta : null;

  const where: Prisma.StockMovementWhereInput = {
    ...(variant ? { variantId: variant.id } : product ? { variant: { productId: product.id } } : {}),
    ...(branch ? { branchId: branch.id } : {}),
    ...(reason ? { reason } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: startOfLocalDay(from) } : {}), ...(to ? { lte: endOfLocalDay(to) } : {}) } } : {}),
  };
  const [rows, totals] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIMIT,
      include: { branch: { select: { name: true } }, variant: { select: { size: true, color: true, fabric: true, sku: true, product: { select: { name: true } } } } },
    }),
    db.stockMovement.aggregate({ where, _count: true, _sum: { delta: true } }),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const net = totals._sum.delta?.toNumber() ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/maestros/stock${product ? `?producto=${product.id}` : ""}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Stock por local
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Movimientos de stock</h1>
        <p className="text-sm text-muted-foreground">
          Cada venta, devolución, compra, ingreso de producción, pedido web, transferencia y ajuste queda registrado con el local, el usuario y el stock que quedó.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Elegí el producto para ver sus talles. Se muestran los últimos {LIMIT} movimientos que coinciden.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/maestros/stock/movimientos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-producto">Producto</Label>
              <NativeSelect id="mv-producto" name="producto" defaultValue={product?.id ?? ""}>
                <option value="">Todos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-variante">Talle / variante</Label>
              <NativeSelect id="mv-variante" name="variante" defaultValue={variant?.id ?? ""} disabled={!product}>
                <option value="">{product ? "Todas" : "Elegí primero el producto"}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    T.{v.size}
                    {variantAttrs(v) ? ` · ${variantAttrs(v)}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-local">Local</Label>
              <NativeSelect id="mv-local" name="local" defaultValue={branch?.id ?? ""}>
                <option value="">Todos</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-motivo">Motivo</Label>
              <NativeSelect id="mv-motivo" name="motivo" defaultValue={reason ?? ""}>
                <option value="">Todos</option>
                {Object.entries(STOCK_MOVE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-desde">Desde</Label>
              <Input id="mv-desde" type="date" name="desde" defaultValue={from ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-hasta">Hasta</Label>
              <Input id="mv-hasta" type="date" name="hasta" defaultValue={to ?? ""} />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Ver movimientos</Button>
              <Button asChild variant="ghost">
                <Link href="/maestros/stock/movimientos">Limpiar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {totals._count} movimiento{totals._count === 1 ? "" : "s"} · saldo neto {net > 0 ? "+" : ""}
            {formatNumber(net)}
          </CardTitle>
          {totals._count > LIMIT && <CardDescription>Se muestran los {LIMIT} más recientes. Achicá el rango de fechas para ver los anteriores.</CardDescription>}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay movimientos con esos filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Entra</TableHead>
                  <TableHead className="text-right">Sale</TableHead>
                  <TableHead className="text-right">Queda</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const d = r.delta.toNumber();
                  const href = r.refType && r.refId && REF_LINKS[r.refType] ? REF_LINKS[r.refType] + r.refId : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{dateTime.format(r.createdAt)}</TableCell>
                      <TableCell>
                        <span className="block">{r.variant.product.name}</span>
                        <span className="text-xs text-muted-foreground">
                          T.{r.variant.size}
                          {variantAttrs(r.variant) ? ` · ${variantAttrs(r.variant)}` : ""} · {r.variant.sku}
                        </span>
                      </TableCell>
                      <TableCell>{r.branch.name}</TableCell>
                      <TableCell>{STOCK_MOVE_LABELS[r.reason as StockMoveReason] ?? r.reason}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{d > 0 ? formatNumber(d) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{d < 0 ? formatNumber(-d) : ""}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${r.balanceAfter.isNegative() ? "text-destructive" : ""}`}>{formatNumber(r.balanceAfter.toNumber())}</TableCell>
                      <TableCell>{r.userId ? (users.get(r.userId) ?? "—") : "Sistema"}</TableCell>
                      <TableCell className="max-w-72 text-sm">
                        {href ? (
                          <Link href={href} className="underline underline-offset-2">
                            {r.notes ?? "Ver comprobante"}
                          </Link>
                        ) : (
                          (r.notes ?? "")
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
