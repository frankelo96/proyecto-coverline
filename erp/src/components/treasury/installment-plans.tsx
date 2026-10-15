"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import type { InstallmentPlan } from "@/lib/pos/installments";
import { saveInstallmentPlansAction } from "@/server/actions/finance.actions";

export function InstallmentPlansEditor({ initial, canEdit }: { initial: InstallmentPlan[]; canEdit: boolean }) {
  const [rows, setRows] = useState(() => initial.filter((p) => p.installments > 1).map((p, i) => ({ key: i, n: String(p.installments), pct: String(p.surchargePct).replace(".", ",") })));
  const { pending, status, execute } = useServerAction();
  const parse = (v: string) => Number(v.replace(",", "."));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.key} className="grid max-w-md grid-cols-[1fr_1fr_auto] items-center gap-2">
          <Input aria-label="Cuotas" inputMode="numeric" value={r.n} disabled={!canEdit} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, n: e.target.value } : x)))} />
          <Input aria-label="Recargo %" inputMode="decimal" value={r.pct} disabled={!canEdit} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, pct: e.target.value } : x)))} />
          {canEdit && (
            <Button type="button" variant="ghost" size="icon" aria-label="Quitar plan" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Columnas: cantidad de cuotas · recargo % sobre el total (0 = sin interés).</p>
      <StatusMessage status={status} />
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setRows((rs) => [...rs, { key: Date.now(), n: "", pct: "0" }])}>
            <Plus /> Agregar plan
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => execute(() => saveInstallmentPlansAction([{ installments: 1, surchargePct: 0 }, ...rows.map((r) => ({ installments: parse(r.n), surchargePct: parse(r.pct) }))]))}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </div>
      )}
    </div>
  );
}
