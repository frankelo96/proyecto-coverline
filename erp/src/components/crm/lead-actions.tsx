"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { LeadStatus } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { LEAD_STATUS_LABELS } from "@/lib/masters/labels";
import { convertLeadAction, setLeadStatusAction } from "@/server/actions/crm.actions";

export function ConvertLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { pending, status, execute } = useServerAction();
  return (
    <>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => execute(() => convertLeadAction(leadId), (d, m) => router.push(`/crm/clientes/${d.clientId}/editar?aviso=${encodeURIComponent(m)}`))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Dar de alta como cliente
      </Button>
      <StatusMessage status={status} />
    </>
  );
}

/** Mover una oportunidad de etapa; "Perdido" pide el motivo. */
export function LeadStatusSelect({ id, status, name }: { id: string; status: LeadStatus; name: string }) {
  const { pending, status: msg, execute } = useServerAction();
  return (
    <div className="flex flex-col gap-1">
      <NativeSelect
        aria-label={`Etapa de ${name}`}
        value={status}
        disabled={pending}
        className="h-8 text-xs"
        onChange={(e) => {
          const next = e.target.value as LeadStatus;
          let lostReason: string | null = null;
          if (next === "PERDIDO") {
            lostReason = window.prompt(`¿Por qué se perdió “${name}”? (precio, plazo, eligió otro proveedor…)`)?.trim() || null;
            if (!lostReason) {
              e.target.value = status;
              return;
            }
          }
          execute(() => setLeadStatusAction({ id, status: next, lostReason }));
        }}
      >
        {Object.values(LeadStatus).map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
      {msg?.kind === "error" && <StatusMessage status={msg} />}
    </div>
  );
}
