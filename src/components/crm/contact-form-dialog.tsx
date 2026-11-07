"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { saveContactAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SERVICES } from "@/lib/constants";
import { formatPhone } from "@/lib/format";
import { useAction } from "./use-action";

export type ContactFormValues = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  monthlyValue: number;
  tags: string[];
};

type Props = {
  contact?: ContactFormValues;
  trigger: ReactNode;
  /** After creating, open the new contact's sheet. */
  openAfterCreate?: boolean;
};

export function ContactFormDialog({ contact, trigger, openAfterCreate = false }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const router = useRouter();
  const editing = Boolean(contact);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = {
      name: form.get("name"),
      company: form.get("company"),
      phone: form.get("phone"),
      email: form.get("email"),
      service: form.get("service"),
      monthlyValue: form.get("monthlyValue"),
      tags: form.get("tags"),
    };
    setError(null);
    run(() => saveContactAction(contact?.id ?? null, raw), {
      success: editing ? "Contacto actualizado" : "Contacto creado",
      onError: setError,
      onSuccess: (data) => {
        setOpen(false);
        if (!editing && openAfterCreate) router.push(`/contactos/${data.id}`);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
          <DialogDescription className={editing ? "sr-only" : undefined}>
            {editing
              ? "Edita los datos del contacto."
              : "Al crear el contacto se abre una oportunidad en “Prospecto” y se dispara la automatización de bienvenida (si está activa)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre *" htmlFor="f_name">
              <Input id="f_name" name="name" defaultValue={contact?.name} required autoFocus />
            </Field>
            <Field label="Empresa" htmlFor="f_co">
              <Input id="f_co" name="company" defaultValue={contact?.company ?? ""} />
            </Field>
            <Field label="WhatsApp" htmlFor="f_ph">
              <Input id="f_ph" name="phone" inputMode="tel" placeholder="+57 300 000 0000" defaultValue={formatPhone(contact?.phone)} />
            </Field>
            <Field label="Correo" htmlFor="f_em">
              <Input id="f_em" name="email" type="email" defaultValue={contact?.email ?? ""} />
            </Field>
            <Field label="Servicio" htmlFor="f_sv">
              <NativeSelect id="f_sv" name="service" defaultValue={contact?.service ?? SERVICES[0]}>
                {SERVICES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Valor mensual (COP)" htmlFor="f_val">
              <Input id="f_val" name="monthlyValue" type="number" min={0} step={50000} defaultValue={contact?.monthlyValue ?? ""} />
            </Field>
          </div>
          <Field label="Etiquetas (separadas por coma)" htmlFor="f_tags">
            <Input id="f_tags" name="tags" defaultValue={contact?.tags.join(", ") ?? ""} />
          </Field>
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : editing ? "Guardar" : "Crear contacto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-[#3b475a]">
        {label}
      </Label>
      {children}
    </div>
  );
}
