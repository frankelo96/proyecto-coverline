"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/production/workflow";
import {
  cancelOrderAction,
  closeCutAction,
  closeQualityAction,
  receiveFromWorkshopAction,
  sendToWorkshopAction,
  skipPersonalizationAction,
  startOrderAction,
} from "@/server/actions/production.actions";
import type { OrderDetail } from "@/server/queries/production-orders.queries";

const int = (v: string) => (v.trim() === "" ? NaN : Number(v));

function NumberField({ id, label, value, onChange, min = 0, step = 1, hint }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="text-right" />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NotesField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Observaciones</Label>
      <Input id={id} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type Runner = ReturnType<typeof useServerAction>;
type RunnerProps = { order: OrderDetail; run: Runner };

function SendForm({ order, run, onRemit }: RunnerProps & { onRemit: (id: string) => void }) {
  const id = useId();
  const { pending, execute } = run;
  const [workshopId, setWorkshopId] = useState(order.workshops[0]?.id ?? "");
  const [pieces, setPieces] = useState(String(order.balance?.unsent ?? 0));
  const [notes, setNotes] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(
          () => sendToWorkshopAction({ orderId: order.id, workshopId, pieces: int(pieces), notes: notes || null }),
          (d) => onRemit(d.remitId),
        );
      }}
    >
      <h3 className="text-sm font-semibold">Enviar piezas a taller</h3>
      {order.workshops.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay talleres activos para esta etapa. Cargalos en Talleres.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-w`}>Taller</Label>
              <NativeSelect id={`${id}-w`} value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
                {order.workshops.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <NumberField id={`${id}-p`} label="Piezas" value={pieces} onChange={setPieces} min={1} hint={`${order.balance?.unsent ?? 0} sin enviar`} />
          </div>
          <NotesField id={`${id}-n`} value={notes} onChange={setNotes} />
          <Button type="submit" disabled={pending || !workshopId} className="w-fit">
            {pending && <Loader2 className="animate-spin" />} Generar remito de envío
          </Button>
        </>
      )}
    </form>
  );
}

function ReceiveForm({ order, run, onRemit }: RunnerProps & { onRemit: (id: string) => void }) {
  const id = useId();
  const holders = order.workshops.filter((w) => w.holding > 0);
  const { pending, execute } = run;
  const [workshopId, setWorkshopId] = useState(holders[0]?.id ?? "");
  const current = holders.find((w) => w.id === workshopId);
  const [pieces, setPieces] = useState(String(current?.holding ?? 0));
  const [waste, setWaste] = useState("0");
  const [rate, setRate] = useState(String(current?.suggestedRate ?? 0));
  const [notes, setNotes] = useState("");

  if (holders.length === 0) return null;

  function pick(wid: string) {
    setWorkshopId(wid);
    const w = holders.find((x) => x.id === wid);
    setPieces(String(w?.holding ?? 0));
    setWaste("0");
    setRate(String(w?.suggestedRate ?? 0));
  }

  const labor = (Number.isFinite(int(pieces)) ? int(pieces) : 0) * (Number(rate) || 0);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(
          () =>
            receiveFromWorkshopAction({
              orderId: order.id,
              workshopId,
              pieces: int(pieces),
              wasteQty: int(waste),
              laborUnitCost: Number(rate),
              notes: notes || null,
            }),
          (d) => onRemit(d.remitId),
        );
      }}
    >
      <h3 className="text-sm font-semibold">Recibir piezas del taller</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={`${id}-w`}>Taller</Label>
          <NativeSelect id={`${id}-w`} value={workshopId} onChange={(e) => pick(e.target.value)}>
            {holders.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — tiene {w.holding} piezas
              </option>
            ))}
          </NativeSelect>
        </div>
        <NumberField id={`${id}-p`} label="Piezas buenas" value={pieces} onChange={setPieces} />
        <NumberField id={`${id}-m`} label="Merma / rechazo" value={waste} onChange={setWaste} />
        <NumberField id={`${id}-r`} label="Fasón por prenda ($)" value={rate} onChange={setRate} step={0.01} hint="Sugerido según ficha técnica / tarifario" />
        <div className="flex flex-col justify-end gap-1 pb-1 text-sm">
          <span className="text-muted-foreground">Deuda con el taller</span>
          <span className="font-mono text-lg font-semibold tabular-nums">{formatMoney(labor)}</span>
        </div>
      </div>
      <NotesField id={`${id}-n`} value={notes} onChange={setNotes} />
      <Button type="submit" disabled={pending || !workshopId} className="w-fit">
        {pending && <Loader2 className="animate-spin" />} Registrar recepción
      </Button>
    </form>
  );
}

function QualityForm({ order, run }: RunnerProps) {
  const id = useId();
  const { pending, execute } = run;
  const [approved, setApproved] = useState<Record<string, string>>(() => {
    // Propuesta inicial: la curva planificada recortada a lo que quedó en proceso.
    let left = order.quantityInProcess;
    return Object.fromEntries(
      order.items.map((i) => {
        const q = Math.min(i.quantity, left);
        left -= q;
        return [i.variantId, String(q)];
      }),
    );
  });
  const [notes, setNotes] = useState("");
  const total = Object.values(approved).reduce((a, v) => a + (Number.isFinite(int(v)) ? int(v) : 0), 0);
  const rejected = order.quantityInProcess - total;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(() =>
          closeQualityAction({
            orderId: order.id,
            approved: order.items.map((i) => ({ variantId: i.variantId, quantity: int(approved[i.variantId] ?? "0") })),
            notes: notes || null,
          }),
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        Cargá las prendas aprobadas, planchadas y embolsadas por talle. Ingresan al stock; la diferencia se registra como merma.
      </p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {order.items.map((i) => (
          <div key={i.variantId} className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-${i.variantId}`} className="text-center">
              {i.size}
            </Label>
            <Input
              id={`${id}-${i.variantId}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="text-center"
              value={approved[i.variantId] ?? "0"}
              onChange={(e) => setApproved((s) => ({ ...s, [i.variantId]: e.target.value }))}
            />
            <span className="text-center text-xs text-muted-foreground">de {i.quantity}</span>
          </div>
        ))}
      </div>
      <p className="text-sm">
        Aprobadas <strong className="font-mono">{total}</strong> de {order.quantityInProcess} en proceso
        {rejected > 0 && <span className="text-accent-strong"> · {rejected} de merma</span>}
        {rejected < 0 && <span className="font-semibold text-destructive"> · superan lo que hay en proceso</span>}
      </p>
      <NotesField id={`${id}-n`} value={notes} onChange={setNotes} />
      <Button type="submit" disabled={pending || rejected < 0} className="w-fit">
        {pending && <Loader2 className="animate-spin" />} Cerrar calidad e ingresar a stock
      </Button>
    </form>
  );
}

function CancelForm({ order }: { order: OrderDetail }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const [reason, setReason] = useState("");
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-medium text-destructive">Cancelar orden</summary>
      <form
        className="flex flex-col gap-3 border-t px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          execute(() => cancelOrderAction({ orderId: order.id, reason }));
        }}
      >
        {order.status === "EN_PROCESO" && (
          <p className="text-sm text-muted-foreground">Los materiales ya descontados al lanzar el corte no se reintegran al stock automáticamente.</p>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-r`}>Motivo (queda auditado)</Label>
          <Input id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        <StatusMessage status={status} />
        <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 5} className="w-fit">
          {pending && <Loader2 className="animate-spin" />} Confirmar cancelación
        </Button>
      </form>
    </details>
  );
}

function SimpleAction({ label, description, action, run, variant = "default" }: {
  label: string;
  description: string;
  action: () => ReturnType<typeof startOrderAction>;
  run: Runner;
  variant?: "default" | "outline";
}) {
  const { pending, execute } = run;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button type="button" variant={variant} disabled={pending} onClick={() => execute(action)} className="w-fit">
        {pending && <Loader2 className="animate-spin" />} {label}
      </Button>
    </div>
  );
}

function CutForm({ order, run }: RunnerProps) {
  const id = useId();
  const { pending, execute } = run;
  const [cut, setCut] = useState(String(order.quantityInProcess));
  const [notes, setNotes] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => closeCutAction({ orderId: order.id, cutPieces: int(cut), notes: notes || null }));
      }}
    >
      <p className="text-sm text-muted-foreground">
        Registrá las piezas efectivamente cortadas. La diferencia con lo planificado queda como merma de corte y la orden pasa a confección.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id={`${id}-c`} label="Prendas cortadas" value={cut} onChange={setCut} min={1} hint={`Planificadas: ${order.quantityInProcess}`} />
        <NotesField id={`${id}-n`} value={notes} onChange={setNotes} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending && <Loader2 className="animate-spin" />} Cerrar corte
      </Button>
    </form>
  );
}

export function OrderActions({ order }: { order: OrderDetail }) {
  const base = useServerAction();
  const [lastRemit, setLastRemit] = useState<string | null>(null);
  // Cada acción nueva limpia el link al remito anterior.
  const run: Runner = {
    ...base,
    execute: (action, onSuccess) => {
      setLastRemit(null);
      base.execute(action, onSuccess);
    },
  };
  const feedback = (
    <>
      <StatusMessage status={run.status} />
      {lastRemit && run.status?.kind === "success" && (
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/produccion/remitos/${lastRemit}`} target="_blank">
            <Printer /> Imprimir remito
          </Link>
        </Button>
      )}
    </>
  );
  if (order.status === "COMPLETADA" || order.status === "CANCELADA") return run.status ? <div className="flex flex-col gap-3">{feedback}</div> : null;
  const external = order.stage === "EN_TALLER_CONFECCION" || order.stage === "EN_PERSONALIZACION";
  const canCancel = !(external && (order.balance?.atWorkshops ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{order.status === "BORRADOR" ? "Lanzar orden" : `Etapa actual: ${STAGE_LABELS[order.stage]}`}</CardTitle>
          {external && order.balance && (
            <CardDescription>
              {order.balance.unsent} sin enviar · {order.balance.atWorkshops} en talleres · {order.balance.received} recibidas · {order.balance.waste} de merma
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {feedback}
          {order.status === "BORRADOR" && (
            <SimpleAction
              label="Lanzar a corte"
              description={`Descuenta del stock las telas y avíos de la ficha técnica para ${order.quantityPlanned} prendas y pasa la orden a la sala de corte.`}
              action={() => startOrderAction({ orderId: order.id })}
              run={run}
            />
          )}
          {order.status === "EN_PROCESO" && order.stage === "CORTE_INTERNO" && <CutForm key={order.stage} order={order} run={run} />}
          {order.status === "EN_PROCESO" && external && (
            <>
              {(order.balance?.unsent ?? 0) > 0 && <SendForm key={`send-${order.stage}-${order.balance?.unsent}`} order={order} run={run} onRemit={setLastRemit} />}
              <ReceiveForm key={`recv-${order.stage}-${order.balance?.atWorkshops}`} order={order} run={run} onRemit={setLastRemit} />
              {order.stage === "EN_PERSONALIZACION" && (order.balance?.sent ?? 0) === 0 && (
                <SimpleAction
                  label="Omitir personalización"
                  description="Si finalmente no lleva bordado ni estampa, pasala directo a calidad y planchado."
                  action={() => skipPersonalizationAction({ orderId: order.id })}
                  run={run}
                  variant="outline"
                />
              )}
            </>
          )}
          {order.status === "EN_PROCESO" && order.stage === "CONTROL_CALIDAD_PLANCHADO" && <QualityForm order={order} run={run} />}
        </CardContent>
      </Card>
      {canCancel && <CancelForm order={order} />}
    </div>
  );
}
