"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatSizeQuantities, parseSizeQuantities } from "@/lib/production/consumption";
import type { MaterialRulesInput } from "@/lib/validations/production";
import { saveMaterialRulesAction } from "@/server/actions/production.actions";

export interface RuleLine {
  rawMaterialId: string;
  name: string;
  type: string;
  uom: string;
  quantity: number;
  sizeQuantities: Record<string, number>;
  alternatives: { color: string | null; fabric: string | null; rawMaterialId: string }[];
}

interface RowState {
  sizes: string;
  alternatives: { key: number; color: string; fabric: string; rawMaterialId: string }[];
}

/**
 * Consumo por talle y material alternativo por color/tela para cada material de la ficha.
 * El costo de la ficha se calcula con el material y el consumo de referencia.
 */
export function MaterialRulesEditor({
  productId,
  lines,
  materials,
  colors,
  fabrics,
  sizes,
  canEdit,
}: {
  productId: string;
  lines: RuleLine[];
  materials: { id: string; name: string; code: string; type: string }[];
  colors: string[];
  fabrics: string[];
  sizes: string[];
  canEdit: boolean;
}) {
  const uid = useId();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.rawMaterialId,
        {
          sizes: formatSizeQuantities(l.sizeQuantities),
          alternatives: l.alternatives.map((a, j) => ({ key: j, color: a.color ?? "", fabric: a.fabric ?? "", rawMaterialId: a.rawMaterialId })),
        },
      ]),
    ),
  );
  const [nextKey, setNextKey] = useState(1000);
  const { pending, status, setStatus, execute } = useServerAction();

  const update = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  function save() {
    const rules: MaterialRulesInput["rules"] = [];
    for (const l of lines) {
      const r = rows[l.rawMaterialId];
      const parsed = parseSizeQuantities(r.sizes);
      if (typeof parsed === "string") {
        setStatus({ kind: "error", text: `${l.name}: ${parsed}` });
        return;
      }
      rules.push({
        rawMaterialId: l.rawMaterialId,
        sizeQuantities: parsed,
        alternatives: r.alternatives
          .filter((a) => a.rawMaterialId)
          .map((a) => ({ color: a.color.trim() || null, fabric: a.fabric.trim() || null, rawMaterialId: a.rawMaterialId })),
      });
    }
    execute(() => saveMaterialRulesAction({ productId, rules }));
  }

  if (lines.length === 0) return <p className="text-sm text-muted-foreground">Primero cargá los materiales de la ficha técnica.</p>;

  return (
    <div className="flex flex-col gap-4">
      <datalist id={`${uid}-colors`}>
        {colors.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={`${uid}-fabrics`}>
        {fabrics.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {lines.map((l) => {
        const r = rows[l.rawMaterialId];
        const sameType = materials.filter((m) => m.type === l.type && m.id !== l.rawMaterialId);
        return (
          <div key={l.rawMaterialId} className="flex flex-col gap-3 rounded-md border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">
                Consumo de referencia: {String(l.quantity).replace(".", ",")} {l.uom.toLowerCase()} por prenda
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-${l.rawMaterialId}-s`}>Consumo por talle (solo los que cambian)</Label>
              <Input
                id={`${uid}-${l.rawMaterialId}-s`}
                value={r.sizes}
                placeholder={sizes.length ? `Ej. ${sizes[0]}=${String(Math.round(l.quantity * 80) / 100).replace(".", ",")}, ${sizes[sizes.length - 1]}=${String(Math.round(l.quantity * 120) / 100).replace(".", ",")}` : "Ej. 4=0,9, XXL=1,6"}
                onChange={(e) => update(l.rawMaterialId, { sizes: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            {(r.alternatives.length > 0 || canEdit) && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Material distinto según el color o la tela de la prenda</span>
                {r.alternatives.map((a) => (
                  <div key={a.key} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                    <Input
                      aria-label="Color de la prenda"
                      list={`${uid}-colors`}
                      placeholder="Color (ej. Bordó)"
                      value={a.color}
                      disabled={!canEdit}
                      onChange={(e) => update(l.rawMaterialId, { alternatives: r.alternatives.map((x) => (x.key === a.key ? { ...x, color: e.target.value } : x)) })}
                    />
                    <Input
                      aria-label="Tela de la prenda"
                      list={`${uid}-fabrics`}
                      placeholder="Tela (opcional)"
                      value={a.fabric}
                      disabled={!canEdit}
                      onChange={(e) => update(l.rawMaterialId, { alternatives: r.alternatives.map((x) => (x.key === a.key ? { ...x, fabric: e.target.value } : x)) })}
                    />
                    <NativeSelect
                      aria-label="Material que se usa"
                      value={a.rawMaterialId}
                      disabled={!canEdit}
                      onChange={(e) => update(l.rawMaterialId, { alternatives: r.alternatives.map((x) => (x.key === a.key ? { ...x, rawMaterialId: e.target.value } : x)) })}
                    >
                      <option value="">Usar…</option>
                      {sameType.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.code})
                        </option>
                      ))}
                    </NativeSelect>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar"
                        onClick={() => update(l.rawMaterialId, { alternatives: r.alternatives.filter((x) => x.key !== a.key) })}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => {
                      update(l.rawMaterialId, { alternatives: [...r.alternatives, { key: nextKey, color: "", fabric: "", rawMaterialId: "" }] });
                      setNextKey(nextKey + 1);
                    }}
                  >
                    <Plus /> Agregar material por color/tela
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <StatusMessage status={status} />
      {canEdit && (
        <Button className="w-fit" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar consumos
        </Button>
      )}
    </div>
  );
}
