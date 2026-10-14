"use client";

import { Download, KeyRound, ListRestart, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { disconnectBridgeAction, regenerateBridgeTokenAction, requestWooCatalogAction } from "@/server/actions/woo.actions";

/** Descarga del plugin de WordPress y acciones sobre la conexión por plugin. */
export function BridgeControls({ connected }: { connected: boolean }) {
  const { pending, status, execute } = useServerAction();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={connected ? "outline" : "default"}>
          <a href="/api/tienda-web/plugin" download>
            <Download /> Descargar plugin para WordPress
          </a>
        </Button>
        {connected && (
          <>
            <Button variant="outline" disabled={pending} onClick={() => execute(() => requestWooCatalogAction())}>
              <ListRestart /> Pedir lista de productos
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => window.confirm("¿Cambiar la clave? El plugin instalado deja de funcionar hasta que subas el nuevo.") && execute(() => regenerateBridgeTokenAction())}
            >
              <KeyRound /> Cambiar clave
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => window.confirm("¿Dejar de usar el plugin? La tienda deja de sincronizarse hasta volver a conectarla.") && execute(() => disconnectBridgeAction())}
            >
              <Unplug /> Desconectar
            </Button>
          </>
        )}
      </div>
      <StatusMessage status={status} />
    </div>
  );
}
