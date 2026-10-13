"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-muted-foreground">
        No pudimos cargar esta pantalla. Verificá la conexión con la base de datos e intentá de nuevo.
        {error.digest && <span className="mt-1 block font-mono text-xs">Ref: {error.digest}</span>}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
