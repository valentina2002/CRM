"use client";

import { useState, type ReactNode } from "react";
import { createDealAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Stage } from "@/generated/prisma/enums";
import { STAGES } from "@/lib/constants";
import { Field } from "./contact-form-dialog";
import { useAction } from "./use-action";

type ContactOption = { id: string; name: string; company: string | null };

type Props = {
  trigger: ReactNode;
  /** Either a fixed contact (from the contact sheet) or a list to choose from (pipeline). */
  contactId?: string;
  contacts?: ContactOption[];
  defaultStage?: Stage;
};

export function DealDialog({ trigger, contactId, contacts = [], defaultStage = "PROSPECT" }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = { contactId: contactId ?? form.get("contactId"), title: form.get("title"), value: form.get("value"), stage: form.get("stage") };
    setError(null);
    run(() => createDealAction(raw), { success: "Oportunidad creada", onError: setError, onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next || setError(null))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nueva oportunidad</DialogTitle>
          <DialogDescription className="sr-only">Crea una oportunidad en el pipeline.</DialogDescription>
        </DialogHeader>
        {!contactId && contacts.length === 0 ? (
          <p className="text-muted-foreground">Primero crea un contacto.</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3" noValidate>
            {contactId ? null : (
              <Field label="Contacto" htmlFor="nd_c">
                <NativeSelect id="nd_c" name="contactId">
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` — ${c.company}` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Título" htmlFor="nd_t">
              <Input id="nd_t" name="title" placeholder="Ej.: SEO local 6 meses" autoFocus />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valor (COP)" htmlFor="nd_v">
                <Input id="nd_v" name="value" type="number" min={0} step={50000} />
              </Field>
              <Field label="Etapa" htmlFor="nd_s">
                <NativeSelect id="nd_s" name="stage" defaultValue={defaultStage}>
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
