"use client";

import { ArrowDownToLine, Loader2, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { closeSessionAction, manualMovementAction, openSessionAction, transferAction } from "@/server/actions/treasury.actions";

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function OpenSessionForm({ registerId, registerName }: { registerId: string; registerName: string }) {
  const id = useId();
  const router = useRouter();
  const { pending, status, execute } = useServerAction();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Abrir turno — {registerName}</CardTitle>
        <CardDescription>Contá el efectivo del cajón (fondo de cambio) antes de empezar a vender.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            execute(
              () => openSessionAction({ registerId, countedAmount: num(amount), notes: notes.trim() || null }),
              (_d, message) => router.replace(`/pos/${registerId}?aviso=${encodeURIComponent(message)}`),
            );
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-a`}>Efectivo contado en caja</Label>
            <Input id={`${id}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="h-12 text-right text-lg" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-n`}>Observaciones</Label>
            <Input id={`${id}-n`} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <StatusMessage status={status} />
          <Button type="submit" size="lg" disabled={pending || amount === ""}>
            {pending && <Loader2 className="animate-spin" />} Abrir turno
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Retiro a caja negra e ingresos/egresos menores del turno, sin mostrar el saldo del cajón. */
export function DrawerActions({ registerId, vaults }: { registerId: string; vaults: { id: string; name: string }[] }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const [mode, setMode] = useState<"RETIRO" | "IN" | "OUT">("RETIRO");
  const [vaultId, setVaultId] = useState(vaults[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");

  return (
    <details className="rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
        <ArrowDownToLine aria-hidden="true" className="size-4" /> Retiro a caja negra / ingresos y egresos del cajón
      </summary>
      <form
        className="flex flex-col gap-3 border-t p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const value = num(amount);
          execute(
            () =>
              mode === "RETIRO"
                ? transferAction({ fromId: registerId, toId: vaultId, amount: value, concept: concept.trim() || "Retiro de efectivo" })
                : manualMovementAction({ registerId, direction: mode, amount: value, concept: concept.trim() }),
            () => {
              setAmount("");
              setConcept("");
            },
          );
        }}
      >
        <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-2">
          {(
            [
              ["RETIRO", "Retiro a caja negra"],
              ["OUT", "Egreso"],
              ["IN", "Ingreso"],
            ] as const
          ).map(([m, label]) => (
            <Button key={m} type="button" role="radio" aria-checked={mode === m} variant={mode === m ? "default" : "outline"} size="sm" onClick={() => setMode(m)}>
              {label}
            </Button>
          ))}
        </div>
        {mode === "RETIRO" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-v`}>Destino</Label>
            <NativeSelect id={`${id}-v`} value={vaultId} onChange={(e) => setVaultId(e.target.value)}>
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-a`}>Importe</Label>
            <Input id={`${id}-a`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-c`}>Concepto{mode !== "RETIRO" && " *"}</Label>
            <Input id={`${id}-c`} maxLength={200} placeholder={mode === "OUT" ? "Ej. flete, librería" : ""} value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
        </div>
        <StatusMessage status={status} />
        <Button type="submit" disabled={pending || amount === "" || (mode !== "RETIRO" && concept.trim().length < 3) || (mode === "RETIRO" && !vaultId)} className="w-fit">
          {pending && <Loader2 className="animate-spin" />} Registrar
        </Button>
      </form>
    </details>
  );
}

export function CloseSessionForm({ sessionId, vaults }: { sessionId: string; vaults: { id: string; name: string }[] }) {
  const id = useId();
  const router = useRouter();
  const { pending, status, execute } = useServerAction();
  const [declared, setDeclared] = useState("");
  const [fund, setFund] = useState("");
  const [vaultId, setVaultId] = useState(vaults[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const declaredN = num(declared);
  const fundN = fund === "" ? 0 : num(fund);
  const withdraw = Number.isFinite(declaredN) ? Math.max(0, Math.round((declaredN - fundN) * 100) / 100) : 0;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole aria-hidden="true" className="size-4" /> Cierre ciego de turno
        </CardTitle>
        <CardDescription>Contá el efectivo del cajón e ingresalo. El sistema compara con lo esperado recién después de cerrar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            execute(
              () => closeSessionAction({ sessionId, declaredAmount: declaredN, withdrawToId: withdraw > 0 ? vaultId : null, withdrawAmount: withdraw, notes: notes.trim() || null }),
              (d) => router.push(`/tesoreria/turnos/${d.sessionId}`),
            );
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-d`}>Efectivo contado</Label>
            <Input id={`${id}-d`} type="number" inputMode="decimal" step="0.01" min={0} className="h-12 text-right text-lg" required value={declared} onChange={(e) => setDeclared(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-f`}>Dejar de fondo para mañana</Label>
              <Input id={`${id}-f`} type="number" inputMode="decimal" step="0.01" min={0} className="text-right" value={fund} onChange={(e) => setFund(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-v`}>El resto va a</Label>
              <NativeSelect id={`${id}-v`} value={vaultId} onChange={(e) => setVaultId(e.target.value)}>
                {vaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {Number.isFinite(declaredN) && (
            <p className="text-sm">
              Retiro a caja negra: <strong className="font-mono">{withdraw.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</strong>
              {fundN > declaredN && <span className="text-destructive"> · el fondo no puede superar lo contado</span>}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-n`}>Observaciones</Label>
            <Input id={`${id}-n`} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <StatusMessage status={status} />
          <Button type="submit" size="lg" disabled={pending || declared === "" || fundN > declaredN || (withdraw > 0 && !vaultId)}>
            {pending && <Loader2 className="animate-spin" />} Cerrar turno
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
