"use client";

import { Loader2, Plus, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { saveExpenseCategoryAction } from "@/server/actions/finance.actions";

interface Category {
  id: string;
  name: string;
  fixed: boolean;
  active: boolean;
}

function Row({ c }: { c: Category }) {
  const [v, setV] = useState(c);
  const { pending, status, execute } = useServerAction();
  const dirty = v.name !== c.name || v.fixed !== c.fixed || v.active !== c.active;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Input aria-label="Nombre de la categoría" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={v.fixed} onChange={(e) => setV({ ...v, fixed: e.target.checked })} /> Fijo mensual
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Activa
        </label>
        <Button type="button" size="sm" variant="outline" disabled={!dirty || pending} onClick={() => execute(() => saveExpenseCategoryAction(v))}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </div>
      <StatusMessage status={status} />
    </div>
  );
}

/** Categorías de gasto: las «fijas» se proyectan todos los meses en el flujo de fondos. */
export function ExpenseCategories({ categories }: { categories: Category[] }) {
  const [name, setName] = useState("");
  const [fixed, setFixed] = useState(false);
  const { pending, status, execute } = useServerAction();
  return (
    <div className="flex flex-col gap-3">
      {categories.map((c) => (
        <Row key={`${c.id}-${c.name}-${c.fixed}-${c.active}`} c={c} />
      ))}
      <div className="grid items-center gap-2 border-t pt-3 sm:grid-cols-[1fr_auto_auto]">
        <Input aria-label="Nueva categoría" placeholder="Nueva categoría (ej. Seguros)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={fixed} onChange={(e) => setFixed(e.target.checked)} /> Fijo mensual
        </label>
        <Button
          type="button"
          size="sm"
          disabled={pending || name.trim().length < 3}
          onClick={() =>
            execute(
              () => saveExpenseCategoryAction({ id: null, name: name.trim(), fixed, active: true }),
              () => {
                setName("");
                setFixed(false);
              },
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
        </Button>
      </div>
      <StatusMessage status={status} />
    </div>
  );
}
