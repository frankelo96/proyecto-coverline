import { ArrowRight, Barcode, ChevronLeft, FileText, Printer, Scissors } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderActions } from "@/components/production/order-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { encodeLabelItems } from "@/lib/catalog/labels";
import { variantAttrs } from "@/lib/catalog/variants";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { STAGE_LABELS, STAGE_ORDER, STATUS_LABELS } from "@/lib/production/workflow";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { getOrderDetail } from "@/server/queries/production-orders.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

const dateTime = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderId } = await params;
  const order = await getOrderDetail(orderId);
  return { title: order ? `OP #${order.number}` : "Orden" };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params }: Props) {
  const user = await requirePageUser(PERMISSIONS.productionRead);
  const { orderId } = await params;
  const order = await getOrderDetail(orderId);
  if (!order) notFound();

  const canWrite = hasPermission(user.permissions, PERMISSIONS.productionWrite);
  const stages = STAGE_ORDER.filter((s) => s !== "EN_PERSONALIZACION" || order.requiresPersonalization || order.logs.some((l) => l.to === s));
  const currentIdx = order.status === "BORRADOR" ? -1 : stages.indexOf(order.stage);
  const unitCost = order.quantityFinished > 0 ? order.actualCost / order.quantityFinished : order.quantityInProcess > 0 ? order.actualCost / order.quantityInProcess : 0;
  const overdue = order.dueDate && order.status !== "COMPLETADA" && order.status !== "CANCELADA" && new Date(order.dueDate) < new Date();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/produccion/ordenes" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Órdenes de producción
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm text-muted-foreground">
            OP #{order.number} · {order.product.sku}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{order.product.name}</h1>
          <p className="text-sm text-muted-foreground">{order.client ? `Pedido de ${order.client.name}` : "Producción para stock"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {order.batch && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/produccion/comprobantes/${order.batch.id}`} target="_blank">
                <FileText /> Comprobante #{order.batch.number}
              </Link>
            </Button>
          )}
          {order.status !== "CANCELADA" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/produccion/ordenes/${order.id}/corte`} target="_blank">
                <Scissors /> Orden de corte
              </Link>
            </Button>
          )}
          {order.quantityFinished > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/maestros/etiquetas?items=${encodeLabelItems(order.items.map((i) => ({ variantId: i.variantId, qty: i.quantityFinished })))}`}>
                <Barcode /> Etiquetas de lo terminado
              </Link>
            </Button>
          )}
          <Badge variant={order.status === "CANCELADA" ? "destructive" : order.status === "COMPLETADA" ? "success" : "default"}>
            {STATUS_LABELS[order.status]}
          </Badge>
        </div>
      </div>

      {/* Stepper de etapas */}
      <ol aria-label="Etapas" className="flex flex-wrap gap-2">
        {stages.map((s, i) => {
          const done = order.status === "COMPLETADA" || i < currentIdx;
          const current = i === currentIdx && order.status === "EN_PROCESO";
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  current && "border-accent bg-accent/15 text-accent-strong",
                  done && "border-success/40 bg-success/10 text-success",
                  !current && !done && "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[s]}
              </span>
              {i < stages.length - 1 && <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Planificadas" value={order.quantityPlanned} />
                <Fact label="En proceso" value={order.status === "BORRADOR" ? "—" : order.quantityInProcess} />
                <Fact label="Terminadas" value={order.quantityFinished} />
                <Fact
                  label="Fecha comprometida"
                  value={order.dueDate ? <span className={overdue ? "text-destructive" : undefined}>{date(order.dueDate)}{overdue && " (vencida)"}</span> : "—"}
                />
                <Fact label="Costo unit. estimado" value={formatMoney(order.estimatedUnitCost)} />
                <Fact label="Costo real acumulado" value={formatMoney(order.actualCost)} />
                <Fact label="Costo real por prenda" value={order.status === "BORRADOR" ? "—" : formatMoney(unitCost)} />
                <Fact label="Creada por" value={order.createdBy ?? "—"} />
              </dl>
              {order.notes && <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{order.notes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Curva de talles</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Talle</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Planificadas</TableHead>
                  <TableHead className="pr-5 text-right">Terminadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((i) => (
                  <TableRow key={i.variantId}>
                    <TableCell className="pl-5 font-medium">{i.size}</TableCell>
                    <TableCell className="text-muted-foreground">{variantAttrs(i) || "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{i.quantity}</TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{i.quantityFinished}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Remitos de talleres</CardTitle>
            </CardHeader>
            {order.remits.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">Todavía no hay envíos a talleres.</p>
              </CardContent>
            ) : (
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Remito</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Taller</TableHead>
                    <TableHead className="text-right">Piezas</TableHead>
                    <TableHead className="text-right">Merma</TableHead>
                    <TableHead className="text-right">Fasón</TableHead>
                    <TableHead className="pr-5">
                      <span className="sr-only">Imprimir</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.remits.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5">
                        <span className="font-mono">#{r.number}</span>{" "}
                        <Badge variant={r.type === "ENVIO" ? "outline" : "success"}>{r.type === "ENVIO" ? "Envío" : "Recepción"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{dateTime(r.date)}</TableCell>
                      <TableCell>
                        {r.workshopName}
                        <span className="block text-xs text-muted-foreground">{STAGE_LABELS[r.stage]}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.pieces}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.type === "RECEPCION" ? r.wasteQty : "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.type === "RECEPCION" ? formatMoney(r.laborTotal) : "—"}</TableCell>
                      <TableCell className="pr-5">
                        <Link
                          href={`/produccion/remitos/${r.id}`}
                          target="_blank"
                          aria-label={`Imprimir remito ${r.number}`}
                          className="flex size-10 items-center justify-center rounded-md hover:bg-muted"
                        >
                          <Printer aria-hidden="true" className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
          {canWrite && <OrderActions order={order} />}

          <Card>
            <CardHeader>
              <CardTitle>Trazabilidad</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-4">
                <li className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">Orden creada</span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(order.createdAt)}
                    {order.createdBy && ` · ${order.createdBy}`}
                  </span>
                </li>
                {order.logs.map((l) => (
                  <li key={l.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3 text-sm">
                    <span className="font-medium">
                      {l.from ? `${STAGE_LABELS[l.from]} → ${STAGE_LABELS[l.to]}` : `Lanzada a ${STAGE_LABELS[l.to]}`}
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                      {l.quantityIn} entran · {l.quantityOut} salen{l.wasteQty > 0 && ` · ${l.wasteQty} merma`}
                    </span>
                    {l.notes && <span className="text-xs text-muted-foreground">{l.notes}</span>}
                    <span className="text-xs text-muted-foreground">
                      {dateTime(l.createdAt)}
                      {l.userName && ` · ${l.userName}`}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
