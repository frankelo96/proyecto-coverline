"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { setWebPriceSyncAction } from "@/server/actions/woo.actions";

/** Interruptor: el ERP publica el precio de lista en la tienda (requiere el plugin 1.3 o posterior). */
export function PriceSyncToggle({ enabled, canWrite }: { enabled: boolean; canWrite: boolean }) {
  const { pending, status, execute } = useServerAction();
  const [on, setOn] = useState(enabled);
  function change(next: boolean) {
    setOn(next);
    execute(async () => {
      const r = await setWebPriceSyncAction(next);
      if (!r.ok) setOn(!next);
      return r;
    });
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" className="size-4" checked={on} disabled={!canWrite || pending} onChange={(e) => change(e.target.checked)} />
        Publicar también los precios en la tienda
        {pending && <Loader2 className="size-4 animate-spin" />}
      </label>
      <p className="text-xs text-muted-foreground">
        La tienda toma el precio de lista minorista con IVA y el ajuste de cada talle. Las ofertas (precio rebajado) que cargues en WooCommerce no se tocan. Necesita el plugin
        versión 1.3 o posterior.
      </p>
      <StatusMessage status={status} />
    </div>
  );
}
