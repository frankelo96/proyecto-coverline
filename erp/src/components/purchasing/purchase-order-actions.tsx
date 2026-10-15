"use client";

import { Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { cancelPurchaseOrderAction } from "@/server/actions/purchasing.actions";

/** Cancelar una orden sin recibir, o cerrar una recibida en parte (lo que falta ya no se espera). */
export function ClosePurchaseOrder({ orderId, partial }: { orderId: string; partial: boolean }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, status, execute } = useServerAction();
  const label = partial ? "Cerrar orden (no llega el resto)" : "Cancelar orden";
  if (!open) {
    return (
      <Button variant="outline" className="w-fit text-destructive" onClick={() => setOpen(true)}>
        <Ban /> {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-r`}>Motivo *</Label>
      <Input id={`${id}-r`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      <StatusMessage status={status} />
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={pending || reason.trim().length < 5}
          onClick={() => execute(() => cancelPurchaseOrderAction({ orderId, reason: reason.trim() }), (_d, m) => router.replace(`/compras/ordenes/${orderId}?aviso=${encodeURIComponent(m)}`))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Ban />} Confirmar
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Volver
        </Button>
      </div>
    </div>
  );
}
