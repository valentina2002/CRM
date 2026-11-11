"use client";

import { Copy, KeyRound, Send, Trash2, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  revokeApiKeyAction,
  setWebhookActiveAction,
  testWebhookAction,
} from "@/app/(app)/ajustes/actions";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WEBHOOK_EVENT_LABEL, WEBHOOK_EVENTS } from "@/lib/webhooks/outgoing";

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copiado"),
    () => toast.error("No se pudo copiar"),
  );
}

/** Shows a value that will never be readable again (API key, webhook secret). */
function ShownOnce({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="grid gap-3">
      <p className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Cópiala ahora y guárdala en un lugar seguro: por seguridad no se vuelve a mostrar.
      </p>
      <Field label={label} htmlFor="shown-once">
        <div className="flex gap-2">
          <Input id="shown-once" readOnly value={value} className="font-mono text-[12.5px]" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="outline" size="sm" onClick={() => copy(value)}>
            <Copy /> Copiar
          </Button>
        </div>
      </Field>
      {children}
    </div>
  );
}

export function CreateApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const { pending, run } = useAction();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreated(null);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRound /> Nueva API key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? `API key “${created.name}”` : "Nueva API key"}</DialogTitle>
          <DialogDescription>
            {created ? "Úsala en el header Authorization: Bearer … de cada petición." : "Crea una key por cada herramienta (Zapier, Make, tu web…) para poder revocarlas por separado."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <ShownOnce label="API key" value={created.key} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Listo, ya la guardé</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name");
              setError(null);
              run(() => createApiKeyAction({ name }), { onError: setError, onSuccess: (data) => setCreated({ key: data.key, name: data.name }) });
            }}
          >
            <Field label="Nombre" htmlFor="key_name">
              <Input id="key_name" name="name" placeholder="Ej.: Zapier, formulario de la web" maxLength={60} autoFocus />
            </Field>
            {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear API key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeApiKeyButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          Revocar
        </Button>
      }
      title="Revocar API key"
      description={
        <>
          Las integraciones que usan <strong>{name}</strong> dejarán de funcionar de inmediato (responderán 401). No se puede deshacer: tendrás que crear una key nueva.
        </>
      }
      confirmLabel="Revocar"
      success="API key revocada"
      action={revokeApiKeyAction.bind(null, id)}
    />
  );
}

export function CreateWebhookDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ secret: string; url: string } | null>(null);
  const { pending, run } = useAction();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreated(null);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Agregar webhook
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Webhook agregado" : "Nuevo webhook saliente"}</DialogTitle>
          <DialogDescription>
            {created ? (
              <>
                Con este secreto verifica el header <code>X-CRM-Signature</code> (HMAC-SHA256 del body).
              </>
            ) : (
              "El CRM enviará un POST con JSON a esta URL cada vez que ocurra uno de los eventos elegidos."
            )}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <ShownOnce label="Secreto de firma" value={created.secret}>
              <p className="text-[12.5px] text-muted-foreground">
                Destino: <code className="break-all">{created.url}</code>. Usa “Probar” para enviar un evento <code>ping</code>.
              </p>
            </ShownOnce>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Listo, ya lo guardé</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setError(null);
              run(() => createWebhookAction({ url: form.get("url"), events: form.getAll("events") }), {
                onError: setError,
                onSuccess: (data) => setCreated({ secret: data.secret, url: data.url }),
              });
            }}
          >
            <Field label="URL de destino" htmlFor="hook_url">
              <Input id="hook_url" name="url" type="url" inputMode="url" placeholder="https://hooks.zapier.com/…" autoFocus />
            </Field>
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-[13px] font-semibold">Eventos</legend>
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-start gap-2 py-0.5 text-[13px]">
                  <input type="checkbox" name="events" value={event} className="mt-0.5 size-4 accent-primary" />
                  <span>
                    <code>{event}</code> <span className="text-muted-foreground">· {WEBHOOK_EVENT_LABEL[event]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Agregar webhook"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WebhookControls({ id, url, active }: { id: string; url: string; active: boolean }) {
  const toggle = useAction();
  const test = useAction();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <label className="mr-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={active}
          disabled={toggle.pending}
          onChange={(e) => toggle.run(() => setWebhookActiveAction(id, e.target.checked), { success: e.target.checked ? "Webhook activado" : "Webhook pausado" })}
        />
        Activo
      </label>
      <Button
        variant="ghost"
        size="sm"
        disabled={test.pending}
        onClick={() =>
          test.run(() => testWebhookAction(id), {
            onSuccess: (r) => (r.ok ? toast.success(`Prueba entregada (${r.statusCode})`) : toast.error(`La prueba falló: ${r.error ?? "sin respuesta"}`)),
          })
        }
      >
        <Send /> {test.pending ? "Enviando…" : "Probar"}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Eliminar webhook ${url}`}>
            <Trash2 />
          </Button>
        }
        title="Eliminar webhook"
        description={
          <>
            Se dejan de enviar eventos a <code className="break-all">{url}</code> y se borra su registro de entregas.
          </>
        }
        confirmLabel="Eliminar"
        success="Webhook eliminado"
        action={deleteWebhookAction.bind(null, id)}
      />
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => copy(value)}>
      <Copy /> Copiar
    </Button>
  );
}
