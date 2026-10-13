"use client";

import { Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { annulPurchaseAction } from "@/server/actions/purchasing.actions";

export function AnnulPurchase({ purchaseId, kind }: { purchaseId: string; kind: "MERCADERIA" | "SERVICIO_TALLER" }) {
  const id = useId();
  const { pending, status, execute } = useServerAction();
  const [reason, setReason] = useState("");
  return (
    <details className="rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-medium text-destructive">Anular comprobante</summary>
      <form
        className="flex flex-col gap-3 border-t px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          execute(() => annulPurchaseAction({ purchaseId, reason }));
        }}
      >
        <p className="text-sm text-muted-foreground">
          {kind === "MERCADERIA"
            ? "Se descuenta del stock lo ingresado y se anula la deuda con el proveedor. Solo si no tiene pagos imputados."
            : "Las recepciones vuelven a quedar pendientes de facturar con su deuda provisoria. Solo si no tiene pagos imputados."}
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-r`}>Motivo (queda auditado)</Label>
          <Input id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        <StatusMessage status={status} />
        <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 5} className="w-fit">
          {pending && <Loader2 className="animate-spin" />} Confirmar anulación
        </Button>
      </form>
    </details>
  );
}
