"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatNumber } from "@/lib/format";
import { addDesignAction, deleteDesignAction } from "@/server/actions/crm.actions";
import type { Client360 } from "@/server/queries/crm.queries";

const EMPTY = { name: "", colors: "", stitchCount: "", sizeCurve: "", vectorLogoUrl: "", notes: "" };

/** Logos y diseños del cliente: colores institucionales, puntadas del bordado y curva de talles habitual. */
export function ClientDesigns({ clientId, designs, canWrite }: { clientId: string; designs: Client360["designs"]; canWrite: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const { pending, status, execute } = useServerAction();
  const set = (k: keyof typeof EMPTY, value: string) => setV((p) => ({ ...p, [k]: value }));

  return (
    <div className="flex flex-col gap-3">
      {designs.length === 0 && !open && <p className="text-sm text-muted-foreground">Sin diseños cargados.</p>}
      <ul className="flex flex-col gap-2">
        {designs.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{d.name}</span>
              <span className="flex flex-wrap gap-1">
                {d.colors.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </span>
              {d.stitchCount ? <span className="text-xs text-muted-foreground">{formatNumber(d.stitchCount)} puntadas</span> : null}
              {d.sizeCurve && (
                <span className="text-xs text-muted-foreground">
                  Curva: {Object.entries(d.sizeCurve)
                    .map(([s, q]) => `${s} ${q}`)
                    .join(" · ")}
                </span>
              )}
              {d.logoUrl && (
                <a href={d.logoUrl} target="_blank" rel="noreferrer noopener" className="w-fit text-xs underline underline-offset-4">
                  Ver logo / archivo
                </a>
              )}
              {d.notes && <span className="text-xs text-muted-foreground">{d.notes}</span>}
            </div>
            {canWrite && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Eliminar diseño ${d.name}`}
                disabled={pending}
                onClick={() => window.confirm(`¿Eliminar el diseño “${d.name}”?`) && execute(() => deleteDesignAction(d.id))}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && !open && (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
          <Plus /> Agregar diseño
        </Button>
      )}
      {open && (
        <form
          className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const stitch = v.stitchCount.trim() ? Number(v.stitchCount.replace(/\D/g, "")) : null;
            execute(() => addDesignAction({ clientId, ...v, stitchCount: stitch, notes: v.notes || null }), () => {
              setV(EMPTY);
              setOpen(false);
            });
          }}
        >
          {(
            [
              ["name", "Nombre del diseño", "Escudo bordado pecho"],
              ["colors", "Colores institucionales", "Azul marino, blanco"],
              ["stitchCount", "Puntadas del bordado", "8500"],
              ["sizeCurve", "Curva de talles habitual", "S:10, M:25, L:20"],
              ["vectorLogoUrl", "Link al logo (Drive, Dropbox…)", "https://"],
              ["notes", "Notas", "Ubicación, tamaño, proveedor…"],
            ] as const
          ).map(([k, label, ph]) => (
            <div key={k} className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-${k}`}>{label}</Label>
              <Input id={`${uid}-${k}`} value={v[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} inputMode={k === "stitchCount" ? "numeric" : undefined} />
            </div>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} Guardar diseño
            </Button>
          </div>
        </form>
      )}
      <StatusMessage status={status} />
    </div>
  );
}
