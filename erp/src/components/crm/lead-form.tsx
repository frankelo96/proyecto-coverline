"use client";

import { Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";
import { LeadStatus } from "@/generated/prisma/enums";
import type { ActionStatus } from "@/hooks/use-server-action";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { LEAD_STATUS_LABELS } from "@/lib/masters/labels";
import { LEAD_SOURCES } from "@/lib/validations/crm";
import { saveLeadAction } from "@/server/actions/crm.actions";

export interface LeadFormValues {
  id: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  expectedClose: string | null;
  notes: string | null;
  lostReason: string | null;
  clientId: string | null;
  ownerId: string | null;
}

export function LeadForm({
  initial,
  clients,
  users,
  readOnly,
}: {
  initial: LeadFormValues;
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  readOnly?: boolean;
}) {
  const uid = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionStatus>(null);
  const [v, setV] = useState({
    ...initial,
    estimatedValue: initial.estimatedValue === null ? "" : String(initial.estimatedValue).replace(".", ","),
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((p) => ({ ...p, [k]: value }));
  const text = (k: "name" | "company" | "email" | "phone" | "source" | "notes" | "lostReason" | "expectedClose") => v[k] ?? "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const est = v.estimatedValue.trim() ? parseLocaleNumber(v.estimatedValue) : null;
    if (v.estimatedValue.trim() && est === null) {
      setStatus({ kind: "error", text: "Valor estimado: ingresá un número" });
      return;
    }
    const payload = { ...v, estimatedValue: est, expectedClose: v.expectedClose || null, clientId: v.clientId || null, ownerId: v.ownerId || null };
    startTransition(async () => {
      const r = await saveLeadAction(payload);
      if (!r.ok) setStatus({ kind: "error", text: r.error });
      else router.push(`/crm/oportunidades/${r.data.id}?aviso=${encodeURIComponent(r.message ?? "Guardado")}`);
    });
  }

  const field = (k: Parameters<typeof text>[0], label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${uid}-${k}`}>{label}</Label>
      <Input id={`${uid}-${k}`} value={text(k)} onChange={(e) => set(k, e.target.value)} disabled={readOnly} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("name", "Contacto *", { placeholder: "Nombre y apellido", autoComplete: "off" })}
          {field("company", "Empresa / institución", { placeholder: "Colegio San José" })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-status`}>Etapa</Label>
            <NativeSelect id={`${uid}-status`} value={v.status} onChange={(e) => set("status", e.target.value as LeadStatus)} disabled={readOnly}>
              {Object.values(LeadStatus).map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {field("email", "Email", { type: "email" })}
          {field("phone", "Teléfono / WhatsApp", { type: "tel" })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-source`}>Origen</Label>
            <Input id={`${uid}-source`} list={`${uid}-sources`} value={text("source")} onChange={(e) => set("source", e.target.value)} disabled={readOnly} />
            <datalist id={`${uid}-sources`}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-value`}>Valor estimado</Label>
            <Input id={`${uid}-value`} inputMode="decimal" value={v.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value)} disabled={readOnly} className="text-right" />
          </div>
          {field("expectedClose", "Cierre esperado", { type: "date" })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-owner`}>Responsable</Label>
            <NativeSelect id={`${uid}-owner`} value={v.ownerId ?? ""} onChange={(e) => set("ownerId", e.target.value)} disabled={readOnly}>
              <option value="">— Yo —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-client`}>Cliente existente (si ya compró)</Label>
            <NativeSelect id={`${uid}-client`} value={v.clientId ?? ""} onChange={(e) => set("clientId", e.target.value)} disabled={readOnly}>
              <option value="">— Todavía no es cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {v.status === "PERDIDO" && field("lostReason", "Motivo de pérdida *", { placeholder: "Precio, plazo, eligió otro proveedor…" })}
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor={`${uid}-notes`}>Notas y seguimiento</Label>
            <Textarea id={`${uid}-notes`} value={text("notes")} onChange={(e) => set("notes", e.target.value)} rows={4} disabled={readOnly} placeholder="Qué necesita, cantidades, talles, fechas, con quién hablar…" />
          </div>
        </CardContent>
      </Card>
      <StatusMessage status={status} />
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link href="/crm/oportunidades">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} {initial.id ? "Guardar" : "Crear oportunidad"}
          </Button>
        </div>
      )}
    </form>
  );
}
