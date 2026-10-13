"use client";

import { Loader2, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import type { EntityKey } from "@/lib/masters/definitions";
import { setMasterActiveAction } from "@/server/actions/masters.actions";

/** Desactivar en lugar de borrar: conserva el historial de ventas, compras y producción. */
export function ActiveToggle({ entity, id, active }: { entity: EntityKey; id: string; active: boolean }) {
  const { pending, status, execute } = useServerAction();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant={active ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={() => {
          if (active && !window.confirm("¿Desactivar? Deja de aparecer en búsquedas y formularios, pero se conserva su historial.")) return;
          execute(() => setMasterActiveAction(entity, id, !active));
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Power />} {active ? "Desactivar" : "Reactivar"}
      </Button>
      <StatusMessage status={status} />
    </div>
  );
}
