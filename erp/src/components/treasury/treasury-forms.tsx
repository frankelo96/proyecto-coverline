"use client";

import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { manualMovementAction, transferAction } from "@/server/actions/treasury.actions";

type Opt = { id: string; name: string; usable: boolean };

export function TransferForm({ registers }: { registers: Opt[] }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const usable = registers.filter((r) => r.usable);
  const [fromId, setFromId] = useState(usable[0]?.id ?? "");
  const [toId, setToId] = useState(usable[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft aria-hidden="true" className="size-4" /> Transferencia entre cajas y cuentas
        </CardTitle>
        <CardDescription>Retiros de caja diaria a caja negra, depósitos de efectivo en el banco, extracciones, fondo de cambio para los locales.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            execute(() => transferAction({ fromId, toId, amount: Number(amount), concept: concept.trim() }), () => {
              setAmount("");
              setConcept("");
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-f`}>Desde</Label>
            <NativeSelect id={`${id}-f`} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {usable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-t`}>Hacia</Label>
            <NativeSelect id={`${id}-t`} value={toId} onChange={(e) => setToId(e.target.value)}>
              {usable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-a`}>Importe</Label>
            <Input id={`${id}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-c`}>Concepto</Label>
            <Input id={`${id}-c`} maxLength={200} placeholder="Ej. retiro, depósito" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Las cajas diarias solo aparecen si tienen el turno abierto.</p>
          <StatusMessage status={status} className="sm:col-span-2" />
          <Button type="submit" disabled={pending || !fromId || !toId || fromId === toId || amount === "" || concept.trim().length < 3} className="w-fit">
            {pending && <Loader2 className="animate-spin" />} Transferir
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ManualMovementForm({ registers }: { registers: Opt[] }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const usable = registers.filter((r) => r.usable);
  const [registerId, setRegisterId] = useState(usable[0]?.id ?? "");
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingreso o egreso</CardTitle>
        <CardDescription>Gastos pagados en efectivo, aportes, comisiones bancarias. Queda auditado con el concepto.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            execute(() => manualMovementAction({ registerId, direction, amount: Number(amount), concept: concept.trim() }), () => {
              setAmount("");
              setConcept("");
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-r`}>Caja / cuenta</Label>
            <NativeSelect id={`${id}-r`} value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              {usable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-d`}>Tipo</Label>
            <NativeSelect id={`${id}-d`} value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}>
              <option value="OUT">Egreso</option>
              <option value="IN">Ingreso</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-a`}>Importe</Label>
            <Input id={`${id}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-c`}>Concepto</Label>
            <Input id={`${id}-c`} maxLength={200} value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
          <StatusMessage status={status} className="sm:col-span-2" />
          <Button type="submit" disabled={pending || !registerId || amount === "" || concept.trim().length < 3} className="w-fit">
            {pending && <Loader2 className="animate-spin" />} Registrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
