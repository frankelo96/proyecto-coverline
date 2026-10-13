import { CalendarClock, Factory, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { ProductionStage } from "@/generated/prisma/enums";
import { STAGE_LABELS } from "@/lib/production/workflow";
import { cn } from "@/lib/utils";
import type { OrderCard } from "@/server/queries/production-orders.queries";

type ColumnKey = "BORRADOR" | ProductionStage;

const COLUMNS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "BORRADOR", label: "Borrador", hint: "Sin lanzar" },
  { key: "CORTE_INTERNO", label: STAGE_LABELS.CORTE_INTERNO, hint: "Sala de corte" },
  { key: "EN_TALLER_CONFECCION", label: STAGE_LABELS.EN_TALLER_CONFECCION, hint: "Talleres externos" },
  { key: "EN_PERSONALIZACION", label: STAGE_LABELS.EN_PERSONALIZACION, hint: "Bordado / estampa" },
  { key: "CONTROL_CALIDAD_PLANCHADO", label: STAGE_LABELS.CONTROL_CALIDAD_PLANCHADO, hint: "Depósito central" },
  { key: "LISTO_ENTREGA", label: STAGE_LABELS.LISTO_ENTREGA, hint: "Últimos 30 días" },
];

const columnOf = (o: OrderCard): ColumnKey => (o.status === "BORRADOR" ? "BORRADOR" : o.stage);

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

function Card({ order }: { order: OrderCard }) {
  const done = order.status === "COMPLETADA";
  return (
    <li>
      <Link
        href={`/produccion/ordenes/${order.id}`}
        className="flex flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-xs transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">OP #{order.number}</span>
          {order.dueDate && (
            <span className={cn("flex items-center gap-1 text-xs", order.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {order.overdue && <span className="sr-only">Vencida:</span>}
              {shortDate(order.dueDate)}
            </span>
          )}
        </div>
        <div>
          <p className="leading-snug font-semibold">{order.productName}</p>
          {order.clientName && <p className="text-xs text-muted-foreground">{order.clientName}</p>}
        </div>
        <p className="font-mono text-xs tabular-nums">
          {done ? `${order.quantityFinished} terminadas de ${order.quantityPlanned}` : `${order.quantityInProcess || order.quantityPlanned} u. en proceso`}
        </p>
        {order.atWorkshops > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-accent-strong">
            <Factory aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>
              {order.atWorkshops} en {order.workshopNames.join(", ")}
              {order.unsent > 0 && ` · ${order.unsent} sin enviar`}
            </span>
          </p>
        )}
        {order.requiresPersonalization && !done && (
          <Badge variant="outline" className="w-fit">
            <Sparkles aria-hidden="true" className="size-3" /> Personalizada
          </Badge>
        )}
      </Link>
    </li>
  );
}

export function OrderBoard({ orders }: { orders: OrderCard[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1080px] grid-cols-6 gap-3">
        {COLUMNS.map((col) => {
          const items = orders.filter((o) => columnOf(o) === col.key);
          const units = items.reduce((a, o) => a + (o.status === "COMPLETADA" ? o.quantityFinished : o.quantityInProcess || o.quantityPlanned), 0);
          return (
            <section key={col.key} aria-labelledby={`col-${col.key}`} className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-2">
              <header className="flex flex-col gap-0.5 px-1 pt-1">
                <h2 id={`col-${col.key}`} className="text-sm font-semibold">
                  {col.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {col.hint} ·{" "}
                  <span className="font-mono tabular-nums">
                    {items.length} OP · {units} u.
                  </span>
                </p>
              </header>
              {items.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Sin órdenes</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((o) => (
                    <Card key={o.id} order={o} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
