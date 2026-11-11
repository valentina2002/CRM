"use client";

import { useState } from "react";
import { connectFacebookAction, disconnectSocialAction } from "@/app/(app)/ajustes/actions";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FacebookConnectForm() {
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        run(() => connectFacebookAction({ pageId: f.get("pageId"), token: f.get("token") }), {
          success: "Página conectada",
          onError: setError,
        });
      }}
    >
      <Field label="ID de la página de Facebook" htmlFor="fb_page">
        <Input id="fb_page" name="pageId" inputMode="numeric" autoComplete="off" />
      </Field>
      <Field label="Token de acceso de la página" htmlFor="fb_token">
        <Input id="fb_token" name="token" type="password" autoComplete="off" placeholder="Se guarda cifrado en el servidor" />
      </Field>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Verificando con Meta…" : "Conectar página"}
        </Button>
      </div>
    </form>
  );
}

export function SocialDisconnectButton() {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Desconectar del CRM</Button>}
      title="Desconectar Facebook e Instagram"
      description={
        <>
          El CRM deja de recibir y enviar mensajes de la página y de Instagram, y se borra el token. <strong>Tus conversaciones siguen en Facebook e Instagram</strong> y lo ya
          recibido se conserva aquí.
        </>
      }
      confirmLabel="Desconectar"
      success="Facebook e Instagram desconectados"
      action={disconnectSocialAction}
    />
  );
}
