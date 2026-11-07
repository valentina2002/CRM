"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { lastInvoiceLinesAction, saveInvoiceAction } from "@/app/(app)/cuentas-de-cobro/actions";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addDaysISO, formatCOP, todayISO } from "@/lib/format";

type Line = { key: number; description: string; quantity: string; unitPrice: string };

export type EditableInvoice = {
  id: string;
  number: string;
  contactId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;
  notes: string | null;
  items: { description: string; quantity: number; unitPrice: number }[];
};

type Props = {
  trigger: ReactNode;
  contacts: { id: string; name: string; company: string | null }[];
  invoice?: EditableInvoice;
  defaultContactId?: string;
};

let lineKey = 0;
const toLine = (it?: { description: string; quantity: number; unitPrice: number }): Line => ({
  key: ++lineKey,
  description: it?.description ?? "",
  quantity: String(it?.quantity ?? 1),
  unitPrice: it ? String(it.unitPrice) : "",
});
const lineTotal = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);

export function InvoiceEditorDialog({ trigger, contacts, invoice, defaultContactId }: Props) {
  const editing = Boolean(invoice);
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(invoice?.contactId ?? defaultContactId ?? contacts[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? addDaysISO(todayISO(), 15));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() => (invoice?.items.length ? invoice.items.map(toLine) : [toLine()]));
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [loadingLast, startLoadingLast] = useTransition();
  const { pending, run } = useAction();
  const router = useRouter();

  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function copyLastInvoice() {
    startLoadingLast(async () => {
      const last = await lastInvoiceLinesAction(contactId);
      if (!last || last.items.length === 0) {
        setCopyHint("Este cliente todavía no tiene cuentas de cobro anteriores.");
        return;
      }
      setLines(last.items.map(toLine));
      setCopyHint(`Actividades copiadas de ${last.number}. Ajusta lo que cambió este mes.`);
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const items = lines
      .filter((l) => l.description.trim() || Number(l.unitPrice))
      .map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }));
    run(() => saveInvoiceAction(invoice?.id ?? null, { contactId, issueDate, dueDate, notes, items }), {
      success: editing ? `${invoice?.number} guardada` : "Borrador creado",
      onError: setError,
      onSuccess: (data) => {
        setOpen(false);
        if (!editing) router.push(`/cuentas-de-cobro/${data.id}`);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setCopyHint(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${invoice?.number}` : "Nueva cuenta de cobro"}</DialogTitle>
          <DialogDescription>Las actividades realizadas en el periodo, con su cantidad y valor unitario.</DialogDescription>
        </DialogHeader>

        {contacts.length === 0 ? (
          <p className="text-muted-foreground">Primero crea un contacto.</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3" noValidate>
            <Field label="Cliente" htmlFor="iv_c">
              <NativeSelect id="iv_c" value={contactId} onChange={(e) => (setContactId(e.target.value), setCopyHint(null))}>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` — ${c.company}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha de emisión" htmlFor="iv_d">
                <Input id="iv_d" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
              </Field>
              <Field label="Fecha límite de pago" htmlFor="iv_u">
                <Input id="iv_u" type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </Field>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-[#3b475a]">Actividades realizadas</span>
                {!editing ? (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={copyLastInvoice} disabled={loadingLast || !contactId}>
                    {loadingLast ? "Buscando…" : "Copiar actividades de su última cuenta"}
                  </Button>
                ) : null}
              </div>
              {copyHint ? <p className="mb-2 rounded-md bg-info-soft px-3 py-1.5 text-[12.5px] text-info">{copyHint}</p> : null}
              <div className="mb-1 hidden grid-cols-[1fr_70px_130px_30px] gap-2 text-[12.5px] text-muted-foreground sm:grid">
                <span>Concepto</span>
                <span>Cant.</span>
                <span>Valor unitario</span>
                <span />
              </div>
              <div className="grid gap-2">
                {lines.map((l, i) => (
                  <div key={l.key} className="grid grid-cols-[1fr_30px] gap-2 rounded-md border p-2 sm:grid-cols-[1fr_70px_130px_30px] sm:border-0 sm:p-0">
                    <Input
                      aria-label={`Actividad ${i + 1}`}
                      placeholder="Actividad realizada"
                      value={l.description}
                      onChange={(e) => update(l.key, { description: e.target.value })}
                      maxLength={300}
                      className="col-span-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Quitar actividad ${i + 1}`}
                      className="sm:order-last"
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <X />
                    </Button>
                    <div className="col-span-2 grid grid-cols-[70px_1fr] gap-2 sm:contents">
                      <Input aria-label={`Cantidad ${i + 1}`} type="number" min={1} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                      <Input
                        aria-label={`Valor unitario ${i + 1}`}
                        type="number"
                        min={0}
                        step={1000}
                        placeholder="0"
                        value={l.unitPrice}
                        onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, toLine()])}>
                <Plus /> Agregar actividad
              </Button>
            </div>

            <Field label="Observaciones (opcional)" htmlFor="iv_n">
              <Textarea id="iv_n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Ej.: Periodo facturado: 1 al 30 de noviembre" />
            </Field>

            <p className="text-right text-base">
              Total: <strong className="tabular-nums">{formatCOP(total)}</strong>
            </p>
            {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : editing ? "Guardar" : "Crear borrador"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
