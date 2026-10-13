"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/server/actions/auth.actions";

const initialState: LoginState = { error: null, email: "" };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-lg border bg-card p-6">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus defaultValue={state.email} key={state.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <div role="alert" aria-live="polite" className="empty:hidden">
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Ingresar
      </Button>
    </form>
  );
}
