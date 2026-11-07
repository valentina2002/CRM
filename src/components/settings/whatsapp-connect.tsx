"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { completeSignupAction, connectManualAction, disconnectAction, requestSyncAction } from "@/app/(app)/ajustes/actions";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FBLoginResponse = { authResponse?: { code?: string } | null; status?: string };
type FB = {
  init: (o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (cb: (r: FBLoginResponse) => void, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

/**
 * Meta Embedded Signup in WhatsApp Business app (coexistence) mode. The `code` lives 30 seconds, so the
 * server action runs as soon as both the code (FB.login callback) and the WABA id (message event) arrive.
 */
export function EmbeddedSignupButton({ appId, configId, graphVersion }: { appId: string; configId: string; graphVersion: string }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string | null }>({});
  const { run } = useAction();

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      setReady(true);
    };
    if (window.FB) window.fbAsyncInit();
    else if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/es_LA/sdk.js";
      document.body.appendChild(s);
    }

    const onMessage = (event: MessageEvent) => {
      let host = "";
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      let data: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; error_message?: string; current_step?: string } };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event?.startsWith("FINISH") && data.data?.waba_id) {
        pending.current.wabaId = data.data.waba_id;
        pending.current.phoneNumberId = data.data.phone_number_id ?? null;
        tryComplete();
      } else if (data.event === "CANCEL") {
        setBusy(false);
        toast("Conexión cancelada en Meta" + (data.data?.current_step ? ` (paso: ${data.data.current_step})` : ""));
      } else if (data.event === "ERROR") {
        setBusy(false);
        toast.error(`Meta: ${data.data?.error_message ?? "error en el registro"}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, graphVersion]);

  function tryComplete() {
    const { code, wabaId, phoneNumberId } = pending.current;
    if (!code || !wabaId) return;
    pending.current = {};
    run(() => completeSignupAction({ code, wabaId, phoneNumberId }), {
      success: "¡WhatsApp conectado! Pedimos la sincronización de contactos e historial.",
      onSuccess: () => setBusy(false),
      onError: (e) => {
        setBusy(false);
        toast.error(e);
      },
    });
  }

  return (
    <Button
      disabled={!ready || busy}
      onClick={() => {
        setBusy(true);
        pending.current = {};
        window.FB?.login(
          (response) => {
            const code = response.authResponse?.code;
            if (!code) {
              setBusy(false);
              return;
            }
            pending.current.code = code;
            tryComplete();
          },
          {
            config_id: configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
          },
        );
      }}
    >
      {busy ? "Conectando con Meta…" : ready ? "Conectar con Meta (usar mi WhatsApp Business)" : "Cargando Meta…"}
    </Button>
  );
}

export function ManualConnectForm() {
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
        run(
          () =>
            connectManualAction({
              wabaId: f.get("wabaId"),
              phoneNumberId: f.get("phoneNumberId"),
              token: f.get("token"),
              coexistence: f.get("coexistence") === "on",
            }),
          { success: "WhatsApp conectado", onError: setError },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WABA ID" htmlFor="w_waba">
          <Input id="w_waba" name="wabaId" inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Phone Number ID" htmlFor="w_phone">
          <Input id="w_phone" name="phoneNumberId" inputMode="numeric" autoComplete="off" />
        </Field>
      </div>
      <Field label="Token de acceso (usuario del sistema)" htmlFor="w_token">
        <Input id="w_token" name="token" type="password" autoComplete="off" placeholder="Se guarda cifrado en el servidor" />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="coexistence" className="size-4 accent-primary" />
        Este número también se usa en la app WhatsApp Business (coexistencia)
      </label>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Verificando con Meta…" : "Conectar con estos datos"}
        </Button>
      </div>
    </form>
  );
}

export function SyncButton({ disabled }: { disabled?: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => run(requestSyncAction, { success: "Solicitud enviada a Meta" })}>
      {pending ? "Solicitando…" : "Reintentar sincronización"}
    </Button>
  );
}

export function DisconnectButton() {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Desconectar del CRM</Button>}
      title="Desconectar WhatsApp"
      description={
        <>
          El CRM deja de enviar y recibir por la API y se borra el token. <strong>Tu número sigue funcionando en la app WhatsApp Business.</strong> Para sacar el
          número de la plataforma de Meta hazlo desde la app: Configuración → Cuenta → Business Platform → Desconectar.
        </>
      }
      confirmLabel="Desconectar"
      success="WhatsApp desconectado"
      action={disconnectAction}
    />
  );
}

export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  return (
    <Field label={label} htmlFor={`copy-${label}`}>
      <div className="flex gap-2">
        <Input id={`copy-${label}`} readOnly value={shown ? value : "•".repeat(Math.min(24, value.length))} className="font-mono text-[12.5px]" />
        {secret ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setShown((s) => !s)}>
            {shown ? "Ocultar" : "Ver"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"))}
        >
          <Copy /> Copiar
        </Button>
      </div>
    </Field>
  );
}
