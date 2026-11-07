"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="font-semibold">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
