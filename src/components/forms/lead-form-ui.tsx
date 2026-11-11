"use client";

import { Code, Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteLeadFormAction, saveLeadFormAction, toggleLeadFormAction } from "@/app/(app)/formularios/actions";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SERVICES } from "@/lib/constants";

export type LeadFormValues = { id: string; name: string; tags: string[]; service: string | null; successMessage: string; redirectUrl: string | null };

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado`),
    () => toast.error("No se pudo copiar"),
  );

export function LeadFormDialog({ form, trigger }: { form?: LeadFormValues; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(n) => {
        setOpen(n);
        setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{form ? "Editar formulario" : "Nuevo formulario"}</DialogTitle>
          <DialogDescription>Cada persona que lo llene entra al CRM como contacto, con su oportunidad en Prospecto, y dispara tus automatizaciones.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setError(null);
            run(
              () =>
                saveLeadFormAction(form?.id ?? null, {
                  name: f.get("name"),
                  tags: f.get("tags"),
                  service: f.get("service"),
                  successMessage: f.get("successMessage"),
                  redirectUrl: f.get("redirectUrl"),
                }),
              { success: form ? "Formulario guardado" : "Formulario creado", onError: setError, onSuccess: () => setOpen(false) },
            );
          }}
        >
          <Field label="Nombre (lo ves tú y aparece en el origen del contacto)" htmlFor="lf_name">
            <Input id="lf_name" name="name" defaultValue={form?.name} placeholder="Ej.: Contacto página web, Bio de Instagram" maxLength={80} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Etiquetas para los contactos" htmlFor="lf_tags">
              <Input id="lf_tags" name="tags" defaultValue={form?.tags.join(", ") ?? "lead web"} placeholder="lead web, campaña" />
            </Field>
            <Field label="Servicio de interés" htmlFor="lf_service">
              <NativeSelect id="lf_service" name="service" defaultValue={form?.service ?? ""}>
                <option value="">Sin definir</option>
                {SERVICES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Mensaje después de enviar" htmlFor="lf_success">
            <Textarea id="lf_success" name="successMessage" rows={2} maxLength={300} defaultValue={form?.successMessage ?? "Gracias por escribir. Te contacto muy pronto por WhatsApp."} />
          </Field>
          <Field label="Página de agradecimiento en tu web (opcional)" htmlFor="lf_redirect">
            <Input id="lf_redirect" name="redirectUrl" type="url" defaultValue={form?.redirectUrl ?? ""} placeholder="https://tusitio.com/gracias" />
          </Field>
          {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeadFormControls({ form, active, publicUrl, embedHtml }: { form: LeadFormValues; active: boolean; publicUrl: string; embedHtml: string }) {
  const toggle = useAction();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="mr-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={active}
          disabled={toggle.pending}
          onChange={(e) => toggle.run(() => toggleLeadFormAction(form.id, e.target.checked), { success: e.target.checked ? "Formulario activo" : "Formulario pausado" })}
        />
        Activo
      </label>
      <Button variant="outline" size="sm" onClick={() => copy(publicUrl, "Enlace")}>
        <Copy /> Copiar enlace
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={publicUrl} target="_blank" rel="noreferrer">
          <ExternalLink /> Abrir
        </a>
      </Button>
      <EmbedDialog html={embedHtml} />
      <LeadFormDialog
        form={form}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${form.name}`}>
            <Pencil />
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${form.name}`}>
            <Trash2 />
          </Button>
        }
        title="Eliminar formulario"
        description={
          <>
            El enlace y el código de <strong>{form.name}</strong> dejan de funcionar. Los contactos que ya llegaron se conservan.
          </>
        }
        confirmLabel="Eliminar"
        success="Formulario eliminado"
        action={deleteLeadFormAction.bind(null, form.id)}
      />
    </div>
  );
}

function EmbedDialog({ html }: { html: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Code /> Código para tu web
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Insertar en tu sitio web</DialogTitle>
          <DialogDescription>
            Pega este HTML donde quieras el formulario (WordPress: bloque “HTML personalizado”). Funciona sin JavaScript; el pequeño script solo agrega la página y la campaña (UTM)
            de donde llegó la persona.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[320px] overflow-auto rounded-md bg-[#0f1b2d] p-3 font-mono text-[11.5px] whitespace-pre-wrap break-all text-[#d7e3f4]">{html}</pre>
        <DialogFooter>
          <Button onClick={() => copy(html, "Código")}>
            <Copy /> Copiar código
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
