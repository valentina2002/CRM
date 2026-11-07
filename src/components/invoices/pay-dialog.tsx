"use client";

import { useState, type ReactNode } from "react";
import { payInvoiceAction } from "@/app/(app)/cuentas-de-cobro/actions";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCOP, todayISO } from "@/lib/format";

export function PayDialog({ trigger, invoiceId, number, total }: { trigger: ReactNode; invoiceId: string; number: string; total: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();
  const [paidAt, setPaidAt] = useState(today);
  const { pending, run } = useAction();

  return (
    <Dialog open={open} onOpenChange={(n) => (setOpen(n), n || setError(null))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Registrar pago de {number}</DialogTitle>
          <DialogDescription>
            Total: <strong className="text-foreground">{formatCOP(total)}</strong>. Si la automatización “Pago recibido” está activa, el cliente pasa a
            “Cliente activo” y recibe el agradecimiento.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            run(() => payInvoiceAction({ invoiceId, paidAt }), {
              success: `${number} marcada como pagada`,
              onError: setError,
              onSuccess: () => setOpen(false),
            });
          }}
        >
          <Field label="Fecha de pago" htmlFor="pay_d">
            <Input id="pay_d" type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} required />
          </Field>
          {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Marcar pagada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
