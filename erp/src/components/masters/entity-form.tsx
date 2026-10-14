"use client";

import { Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";
import type { ActionStatus } from "@/hooks/use-server-action";
import type { EntityKey } from "@/lib/masters/definitions";
import { type FieldDef, type FieldValue, MONTH_OPTIONS, type RefOptions, type Values } from "@/lib/masters/fields";
import { cn } from "@/lib/utils";
import { saveMasterAction } from "@/server/actions/masters.actions";

type Raw = Record<string, string | boolean | string[]>;

/** Valor del modelo → valor editable en el formulario. */
function toRaw(f: FieldDef, v: FieldValue | undefined): string | boolean | string[] {
  const value = v === undefined ? (f.defaultValue ?? null) : v;
  if (f.type === "bool") return value === true;
  if (f.type === "multiselect" || f.type === "months") return Array.isArray(value) ? value.map(String) : [];
  if (f.type === "tags") return Array.isArray(value) ? value.join(", ") : "";
  if (value === null) return "";
  // Números con coma decimal, como se escriben en Argentina.
  if (typeof value === "number") return String(value).replace(".", ",");
  return String(value);
}

export interface EntityFormProps {
  entity: EntityKey;
  id: string | null;
  fields: FieldDef[];
  initial: Values | null;
  refs: RefOptions;
  basePath: string;
  /** A dónde ir después de guardar: "detail" (/base/id) o "list" */
  after?: "detail" | "list" | "stay";
  readOnly?: boolean;
}

export function EntityForm({ entity, id, fields, initial, refs, basePath, after = "detail", readOnly }: EntityFormProps) {
  const uid = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionStatus>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Raw>(() => Object.fromEntries(fields.map((f) => [f.key, toRaw(f, initial?.[f.key])])));

  const set = (key: string, v: string | boolean | string[]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const sections = [...new Set(fields.map((f) => f.section ?? ""))];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const r = await saveMasterAction(entity, id, values);
      if (!r.ok) {
        setStatus({ kind: "error", text: r.error });
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
        return;
      }
      const aviso = encodeURIComponent(r.message ?? "Guardado");
      if (after === "stay") {
        setStatus({ kind: "success", text: r.message ?? "Guardado" });
        router.refresh();
      } else router.push(after === "list" ? `${basePath}?aviso=${aviso}` : `${basePath}/${r.data.id}?aviso=${aviso}`);
    });
  }

  function control(f: FieldDef) {
    const fid = `${uid}-${f.key}`;
    const invalid = !!errors[f.key];
    const describedBy = [f.help ? `${fid}-help` : null, invalid ? `${fid}-err` : null].filter(Boolean).join(" ") || undefined;
    const common = { id: fid, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, disabled: readOnly };
    const v = values[f.key];

    if (f.type === "bool") {
      return (
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={v === true} onChange={(e) => set(f.key, e.target.checked)} {...common} />
          {f.label}
        </label>
      );
    }
    if (f.type === "multiselect" || f.type === "months") {
      const opts = f.type === "months" ? MONTH_OPTIONS : (f.options ?? []);
      const selected = (v as string[]) ?? [];
      return (
        <div role="group" aria-labelledby={`${fid}-label`} aria-describedby={describedBy} className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                disabled={readOnly}
                onClick={() => set(f.key, on ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
                className={cn(
                  "h-9 rounded-md border px-2.5 text-sm transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
                )}
              >
                {f.type === "months" ? o.label.slice(0, 3) : o.label}
              </button>
            );
          })}
        </div>
      );
    }
    if (f.type === "select" || f.type === "ref") {
      const opts = f.type === "ref" ? (refs[f.ref ?? ""] ?? []) : (f.options ?? []);
      return (
        <NativeSelect value={v as string} onChange={(e) => set(f.key, e.target.value)} {...common}>
          {(!f.required || f.type === "ref") && <option value="">{f.type === "ref" ? "— Ninguno —" : "—"}</option>}
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      );
    }
    if (f.type === "textarea") {
      return <Textarea value={v as string} onChange={(e) => set(f.key, e.target.value)} maxLength={f.max} rows={3} {...common} />;
    }
    const inputMode = f.type === "number" ? "decimal" : f.type === "int" ? "numeric" : f.type === "phone" ? "tel" : undefined;
    const suggestions = f.suggest ? (refs[f.suggest] ?? []) : [];
    const listId = suggestions.length > 0 ? `${uid}-${f.key}-list` : undefined;
    return (
      <>
        <Input
          type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
          inputMode={inputMode}
          autoComplete="off"
          list={listId}
          value={v as string}
          maxLength={f.max}
          placeholder={f.placeholder ?? (f.type === "tags" ? "colegio, reposicion-anual" : undefined)}
          onChange={(e) => set(f.key, e.target.value)}
          className={cn(f.upper && "uppercase", (f.type === "number" || f.type === "int") && "text-right")}
          {...common}
        />
        {listId && (
          <datalist id={listId}>
            {suggestions.map((o) => (
              <option key={o.value} value={o.value} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {sections.map((section) => (
        <Card key={section || "main"}>
          {section && (
            <CardHeader>
              <CardTitle>{section}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields
              .filter((f) => (f.section ?? "") === section)
              .map((f) => {
                const fid = `${uid}-${f.key}`;
                return (
                  <div key={f.key} className={cn("flex flex-col gap-1.5", f.wide && "sm:col-span-2 lg:col-span-3", (f.type === "multiselect" || f.type === "months") && "sm:col-span-2")}>
                    {f.type !== "bool" && (
                      <Label id={`${fid}-label`} htmlFor={fid}>
                        {f.label}
                        {f.required && <span className="text-destructive"> *</span>}
                      </Label>
                    )}
                    {control(f)}
                    {f.help && (
                      <p id={`${fid}-help`} className="text-xs text-muted-foreground">
                        {f.help}
                      </p>
                    )}
                    {errors[f.key] && (
                      <p id={`${fid}-err`} className="text-xs text-destructive">
                        {errors[f.key]}
                      </p>
                    )}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      ))}
      <StatusMessage status={status} />
      {!readOnly && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={id && after === "detail" ? `${basePath}/${id}` : basePath}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} {id ? "Guardar cambios" : "Crear"}
          </Button>
        </div>
      )}
    </form>
  );
}
