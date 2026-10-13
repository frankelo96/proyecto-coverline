"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import type { ChequeKind, ChequeStatus } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { canTransition } from "@/lib/treasury/cheques";
import { chequeAction } from "@/server/actions/treasury.actions";

type Action = "DEPOSITAR" | "COBRAR" | "DEBITAR" | "RECHAZAR" | "ANULAR";
const LABELS: Record<Action, string> = { DEPOSITAR: "Depositar", COBRAR: "Cobrar en efectivo", DEBITAR: "Marcar debitado", RECHAZAR: "Rechazado", ANULAR: "Anular / devolver" };
const TARGET: Record<Action, ChequeStatus> = { DEPOSITAR: "DEPOSITADO", COBRAR: "COBRADO", DEBITAR: "DEBITADO", RECHAZAR: "RECHAZADO", ANULAR: "ANULADO" };

export function ChequeActions({
  chequeId,
  kind,
  status,
  collectable,
  banks,
  cashRegisters,
}: {
  chequeId: string;
  kind: ChequeKind;
  status: ChequeStatus;
  collectable: boolean;
  banks: { id: string; name: string }[];
  cashRegisters: { id: string; name: string }[];
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { pending, status: result, execute } = useServerAction();
  const actions = (Object.keys(LABELS) as Action[]).filter((a) => canTransition(kind, status, TARGET[a]));
  const [action, setAction] = useState<Action | "">("");
  const [registerId, setRegisterId] = useState("");
  const [reason, setReason] = useState("");
  if (actions.length === 0) return result ? <StatusMessage status={result} /> : null;

  const needsRegister = action === "DEPOSITAR" || action === "COBRAR";
  const needsReason = action === "RECHAZAR" || action === "ANULAR";
  const registers = action === "DEPOSITAR" ? banks : cashRegisters;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!action) return;
        execute(() =>
          chequeAction(
            needsRegister
              ? { action, chequeId, registerId }
              : needsReason
                ? { action, chequeId, reason: reason.trim() }
                : { action: "DEBITAR", chequeId },
          ),
          // La fila puede salir de la vista filtrada: el aviso se muestra arriba de la tabla.
          (_d, message) => {
            const next = new URLSearchParams(params);
            next.set("aviso", message);
            router.replace(`${pathname}?${next}`);
          },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-a`} className="sr-only">
            Acción
          </Label>
          <NativeSelect
            id={`${id}-a`}
            value={action}
            onChange={(e) => {
              const a = e.target.value as Action | "";
              setAction(a);
              setRegisterId((a === "DEPOSITAR" ? banks : cashRegisters)[0]?.id ?? "");
            }}
            className="h-9 min-w-44"
          >
            <option value="">Acción…</option>
            {actions.map((a) => (
              <option key={a} value={a} disabled={(a === "DEPOSITAR" || a === "COBRAR") && !collectable}>
                {LABELS[a]}
                {(a === "DEPOSITAR" || a === "COBRAR") && !collectable ? " (aún no vence)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        {needsRegister && (
          <NativeSelect aria-label="Cuenta o caja" value={registerId} onChange={(e) => setRegisterId(e.target.value)} className="h-9 min-w-44">
            {registers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {needsReason && <Input aria-label="Motivo" placeholder="Motivo" className="h-9 w-48" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
        {action && (
          <Button type="submit" size="sm" disabled={pending || (needsRegister && !registerId) || (needsReason && reason.trim().length < 5)}>
            {pending && <Loader2 className="animate-spin" />} Aplicar
          </Button>
        )}
      </div>
      <StatusMessage status={result} />
    </form>
  );
}
