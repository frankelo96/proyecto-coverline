"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type ChangePasswordState } from "@/server/actions/auth.actions";

const initialState: ChangePasswordState = { error: null, done: false };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-lg border bg-card p-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="current">Contraseña actual</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="next">Nueva contraseña</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required aria-describedby="next-help" />
        <p id="next-help" className="text-xs text-muted-foreground">
          Mínimo 10 caracteres. Conviene una frase fácil de recordar (ej. «uniformes-del-cerro-2026»).
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repetí la nueva contraseña</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div role="alert" aria-live="polite" className="empty:hidden">
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Cambiar contraseña
      </Button>
    </form>
  );
}
