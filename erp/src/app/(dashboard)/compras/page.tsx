import { Package, Plus, Scissors } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PurchaseKind } from "@/generated/prisma/enums";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { ITEM_TYPE_LABELS, PURCHASE_KIND_LABELS } from "@/lib/purchasing/labels";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { listPurchases } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Compras" };
export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; kind: PurchaseKind | null }[] = [
  { key: "todas", label: "Todas", kind: null },
  { key: "mercaderia", label: "Mercadería", kind: "MERCADERIA" },
  { key: "talleres", label: "Servicios de talleres", kind: "SERVICIO_TALLER" },
];

type Props = { searchParams: Promise<{ tipo?: string }> };

export default async function PurchasesPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.purchasesRead);
  const { tipo } = await searchParams;
  const tab = TABS.find((t) => t.key === tipo) ?? TABS[0];
  const rows = await listPurchases(tab.kind);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.purchasesWrite);
  const active = rows.filter((r) => r.status !== "ANULADA");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">
            {active.length} comprobantes · {formatMoney(active.reduce((a, r) => a + r.total, 0), { round: true })} · saldo a pagar{" "}
            {formatMoney(active.reduce((a, r) => a + r.balance, 0), { round: true })}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/compras/mercaderia/nueva">
                <Package /> Compra de mercadería
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/compras/talleres/nueva">
                <Scissors /> Factura de taller
              </Link>
            </Button>
          </div>
        )}
      </div>

      <nav aria-label="Tipo de compra" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "todas" ? "/compras" : `/compras?tipo=${t.key}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "flex h-10 items-center rounded-md border px-3 text-sm",
              t === tab ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Proveedor / taller</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="pr-5 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {canWrite ? (
                    <span className="flex flex-col items-center gap-3">
                      Todavía no hay compras cargadas.
                      <Button asChild size="sm">
                        <Link href="/compras/mercaderia/nueva">
                          <Plus /> Cargar la primera
                        </Link>
                      </Button>
                    </span>
                  ) : (
                    "Todavía no hay compras cargadas."
                  )}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className={r.status === "ANULADA" ? "text-muted-foreground line-through decoration-muted-foreground/50" : undefined}>
                <TableCell className="pl-5">
                  <Link href={`/compras/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                    #{r.number}
                  </Link>
                </TableCell>
                <TableCell>{new Date(r.date).toLocaleDateString("es-AR")}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={r.kind === "MERCADERIA" ? "default" : "accent"}>{PURCHASE_KIND_LABELS[r.kind]}</Badge>
                    {r.itemTypes.map((t) => (
                      <Badge key={t} variant="outline">
                        {ITEM_TYPE_LABELS[t]}
                      </Badge>
                    ))}
                    {r.status === "ANULADA" && <Badge variant="destructive">Anulada</Badge>}
                  </div>
                </TableCell>
                <TableCell>{r.creditorName}</TableCell>
                <TableCell className="font-mono text-xs">{r.voucher}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.total)}</TableCell>
                <TableCell className="pr-5 text-right font-mono tabular-nums">{r.balance > 0 ? formatMoney(r.balance) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
