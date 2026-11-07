"use client";

import { useState, type ReactNode } from "react";
import { saveIssuerAction } from "@/app/(app)/cuentas-de-cobro/actions";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type IssuerValues = { name: string; document: string; city: string; paymentInfo: string; showAmountInWords: boolean };

export function IssuerDialog({ trigger, issuer }: { trigger: ReactNode; issuer: IssuerValues }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();

  return (
    <Dialog open={open} onOpenChange={(n) => (setOpen(n), n || setError(null))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Datos del emisor</DialogTitle>
          <DialogDescription>Aparecen en tus cuentas de cobro (“DEBE A:”, firma y datos de pago).</DialogDescription>
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
                saveIssuerAction({
                  name: f.get("name"),
                  document: f.get("document"),
                  city: f.get("city"),
                  paymentInfo: f.get("paymentInfo"),
                  showAmountInWords: f.get("showAmountInWords") === "on",
                }),
              { success: "Datos guardados", onError: setError, onSuccess: () => setOpen(false) },
            );
          }}
        >
          <Field label="Nombre completo" htmlFor="is_n">
            <Input id="is_n" name="name" defaultValue={issuer.name} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Documento (C.C. / NIT)" htmlFor="is_d">
              <Input id="is_d" name="document" defaultValue={issuer.document} placeholder="C.C. 1.234.567.890" required />
            </Field>
            <Field label="Ciudad" htmlFor="is_c">
              <Input id="is_c" name="city" defaultValue={issuer.city} required />
            </Field>
          </div>
          <Field label="Datos de pago" htmlFor="is_p">
            <Textarea id="is_p" name="paymentInfo" rows={3} defaultValue={issuer.paymentInfo} placeholder="Banco · Tipo de cuenta · Número · Titular" />
          </Field>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="showAmountInWords" defaultChecked={issuer.showAmountInWords} className="size-4 accent-primary" />
            Mostrar el total en letras (“Son: … pesos M/CTE”)
          </label>
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
