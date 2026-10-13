"use client";

import { Loader2, Save, UserPlus } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { saveUserAction } from "@/server/actions/users.actions";

export interface UserFormValues {
  id: string | null;
  name: string;
  email: string;
  roleId: string;
  active: boolean;
}

export function UserForm({ initial, roles, onDone }: { initial: UserFormValues; roles: { id: string; name: string; description: string | null }[]; onDone?: () => void }) {
  const uid = useId();
  const [v, setV] = useState({ ...initial, password: "" });
  const { pending, status, execute } = useServerAction();
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((p) => ({ ...p, [k]: value }));

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveUserAction(v), () => {
          // Alta: deja el formulario vacío para cargar otro usuario.
          setV((p) => (initial.id ? { ...p, password: "" } : { ...initial, password: "" }));
          onDone?.();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-name`}>Nombre</Label>
        <Input id={`${uid}-name`} value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-email`}>Email (usuario de ingreso)</Label>
        <Input id={`${uid}-email`} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-role`}>Rol</Label>
        <NativeSelect id={`${uid}-role`} value={v.roleId} onChange={(e) => set("roleId", e.target.value)}>
          <option value="">Elegí un rol…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.description ? ` — ${r.description}` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-pass`}>{initial.id ? "Nueva contraseña (opcional)" : "Contraseña inicial"}</Label>
        <Input
          id={`${uid}-pass`}
          type="password"
          value={v.password}
          onChange={(e) => set("password", e.target.value)}
          autoComplete="new-password"
          placeholder={initial.id ? "Dejar vacío para no cambiarla" : "Mínimo 10 caracteres"}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-primary" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
        Usuario activo
      </label>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : initial.id ? <Save /> : <UserPlus />} {initial.id ? "Guardar" : "Crear usuario"}
        </Button>
      </div>
      <StatusMessage status={status} className="sm:col-span-2" />
    </form>
  );
}
