import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnnulPurchase } from "@/components/purchasing/annul-purchase";
import { TotalsBox } from "@/components/purchasing/totals-box";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber, UOM_SHORT } from "@/lib/format";
import { ITEM_TYPE_LABELS, PURCHASE_KIND_LABELS, PURCHASE_STATUS_LABELS } from "@/lib/purchasing/labels";
import { PAYMENT_METHOD_LABELS } from "@/lib/validations/purchasing";
import { requirePageUser } from "@/server/auth/session";
import { getPurchaseDetail } from "@/server/queries/purchasing.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ purchaseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { purchaseId } = await params;
  const p = await getPurchaseDetail(purchaseId);
  return { title: p ? `Compra #${p.number}` : "Compra" };
}

const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

export default async function PurchaseDetailPage({ params }: Props) {
  const user = await requirePageUser(PERMISSIONS.purchasesRead);
  const { purchaseId } = await params;
  const p = await getPurchaseDetail(purchaseId);
  if (!p) notFound();
  const merch = p.kind === "MERCADERIA";
  const canWrite = hasPermission(user.permissions, PERMISSIONS.purchasesWrite);
  const canSeeAccount = hasPermission(user.permissions, PERMISSIONS.payablesRead);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/compras" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Compras
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm text-muted-foreground">Compra #{p.number}</p>
          <h1 className="text-3xl font-bold tracking-tight">{p.voucher}</h1>
          <p className="text-sm text-muted-foreground">
            {p.creditor.type === "taller" ? "Taller" : "Proveedor"}:{" "}
            {canSeeAccount ? (
              <Link href={`/compras/cuentas/${p.creditor.type}/${p.creditor.id}`} className="font-medium text-foreground underline underline-offset-4">
                {p.creditor.name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{p.creditor.name}</span>
            )}
            {p.creditor.cuit && ` · CUIT ${p.creditor.cuit}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={merch ? "default" : "accent"}>{PURCHASE_KIND_LABELS[p.kind]}</Badge>
          <Badge variant={p.status === "ANULADA" ? "destructive" : "success"}>{PURCHASE_STATUS_LABELS[p.status]}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{merch ? "Ítems" : "Servicios facturados"}</CardTitle>
            </CardHeader>
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Detalle</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio unit.</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="pr-5">{merch ? "Stock y costo" : "Fasón pactado"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="pl-5">
                      {i.productionOrderId ? (
                        <Link href={`/produccion/ordenes/${i.productionOrderId}`} className="underline-offset-4 hover:underline">
                          {i.description}
                        </Link>
                      ) : (
                        i.description
                      )}
                      <span className="block">
                        <Badge variant="outline">{ITEM_TYPE_LABELS[i.itemType]}</Badge>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatNumber(i.quantity)} {UOM_SHORT[i.uom]}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.unitCost)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.subtotal)}</TableCell>
                    <TableCell className="pr-5 text-xs">
                      {merch ? (
                        <>
                          {i.stockQuantity !== null && i.stockQuantity !== i.quantity && <span className="block">→ {formatNumber(i.stockQuantity)} en unidad de stock</span>}
                          {i.updatedCost && i.previousUnitCost !== null && i.stockUnitCost !== null ? (
                            <span className={i.stockUnitCost > i.previousUnitCost ? "block font-medium text-accent-strong" : "block text-success"}>
                              Reposición {formatMoney(i.previousUnitCost)} → {formatMoney(i.stockUnitCost)}
                            </span>
                          ) : (
                            <span className="block text-muted-foreground">Costo sin cambios</span>
                          )}
                        </>
                      ) : (
                        i.previousUnitCost !== null && (
                          <span className={i.previousUnitCost !== i.unitCost ? "font-medium text-accent-strong" : "text-muted-foreground"}>
                            {formatMoney(i.previousUnitCost)} por prenda
                          </span>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagos imputados</CardTitle>
            </CardHeader>
            <CardContent>
              {p.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin pagos.</p>
              ) : (
                <ul className="flex flex-col divide-y text-sm">
                  {p.payments.map((x) => (
                    <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {date(x.date)} · {PAYMENT_METHOD_LABELS[x.method as keyof typeof PAYMENT_METHOD_LABELS] ?? x.method}
                        {x.orderId && (
                          <>
                            {" · "}
                            <Link href={`/compras/pagos/${x.orderId}`} target="_blank" className="underline underline-offset-4">
                              Orden de pago #{x.orderNumber}
                            </Link>
                          </>
                        )}
                      </span>
                      <span className="font-mono tabular-nums">{formatMoney(x.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Fecha</dt>
                  <dd>{date(p.date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Vencimiento</dt>
                  <dd>{p.dueDate ? date(p.dueDate) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cargada por</dt>
                  <dd>{p.createdBy ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Saldo</dt>
                  <dd className="font-mono font-semibold">{formatMoney(p.balance)}</dd>
                </div>
              </dl>
              <div className="border-t pt-4">
                <TotalsBox totals={p.totals} />
              </div>
              {p.notes && <p className="border-t pt-4 text-sm text-muted-foreground">{p.notes}</p>}
            </CardContent>
          </Card>
          {canWrite && p.status !== "ANULADA" && p.payments.length === 0 && <AnnulPurchase purchaseId={p.id} kind={p.kind} />}
        </aside>
      </div>
    </div>
  );
}
