"use client";

import { Check, Loader2, Unlink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/hooks/use-server-action";
import { linkWooItemAction } from "@/server/actions/woo.actions";

/** Vincular a mano un artículo de la tienda escribiendo el SKU o código de barras de la variante del ERP. */
export function LinkCell({ linkId, current, datalistId, canWrite }: { linkId: string; current: string | null; datalistId: string; canWrite: boolean }) {
  const [sku, setSku] = useState(current ?? "");
  const { pending, status, execute } = useServerAction();
  if (!canWrite) return <span className="font-mono text-xs">{current ?? "—"}</span>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          aria-label="SKU de la variante del ERP"
          list={datalistId}
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          placeholder="SKU del ERP"
          className="h-8 w-56 font-mono text-xs"
        />
        <Button size="icon" variant="ghost" className="size-8" aria-label="Guardar vínculo" disabled={pending || !sku || sku === current} onClick={() => execute(() => linkWooItemAction({ linkId, variantSku: sku }))}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        {current && (
          <Button size="icon" variant="ghost" className="size-8" aria-label="Desvincular" disabled={pending} onClick={() => execute(() => linkWooItemAction({ linkId, variantSku: null }), () => setSku(""))}>
            <Unlink />
          </Button>
        )}
      </div>
      {status?.kind === "error" && <span className="text-xs text-destructive">{status.text}</span>}
    </div>
  );
}
