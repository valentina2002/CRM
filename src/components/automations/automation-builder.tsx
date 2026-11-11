"use client";

import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { saveAutomationAction } from "@/app/(app)/automatizaciones/actions";
import { Field } from "@/components/crm/contact-form-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { TriggerType } from "@/generated/prisma/enums";
import { MAX_ACTIONS, WAIT_PATTERN, type AutomationAction } from "@/lib/automation-engine";
import { ACTION_LABEL, CONTACT_SOURCE_LABEL, STAGES, TRIGGER_LABEL, type AutomationActionType } from "@/lib/constants";

export type EditableAutomation = { id: string; name: string; trigger: TriggerType; condition: string | null; actions: AutomationAction[] };

type DraftAction = { key: number; type: AutomationActionType; value: string };
let k = 0;
const draft = (a?: AutomationAction): DraftAction => ({ key: ++k, type: a?.type ?? "send_whatsapp", value: a?.value ?? "" });

const VARIABLES = ["{nombre}", "{empresa}", "{factura}", "{valor}", "{vence}"];

const DEFAULT_VALUE: Partial<Record<AutomationActionType, string>> = { move_stage: "ACTIVE_CLIENT", wait: "2d", wait_due: "-3", stop_if: "replied" };
const DUE_TRIGGERS: TriggerType[] = ["INVOICE_SENT", "INVOICE_OVERDUE"];
const INVOICE_TRIGGERS: TriggerType[] = ["INVOICE_SENT", "INVOICE_PAID", "INVOICE_OVERDUE"];

/** "Cuando… → Entonces…" builder, like the prototype's editAuto(). */
export function AutomationBuilder({ trigger, automation }: { trigger: ReactNode; automation?: EditableAutomation }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(automation?.name ?? "");
  const [when, setWhen] = useState<TriggerType>(automation?.trigger ?? "MESSAGE_RECEIVED");
  const [condition, setCondition] = useState(automation?.condition ?? "");
  const [actions, setActions] = useState<DraftAction[]>(() => (automation?.actions.length ? automation.actions.map(draft) : [draft()]));
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();

  const update = (key: number, patch: Partial<DraftAction>) => setActions((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const usesKeyword = when === "MESSAGE_RECEIVED";
  const usesStage = when === "DEAL_STAGE_CHANGED";
  const usesSource = when === "CONTACT_CREATED";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    run(
      () =>
        saveAutomationAction(automation?.id ?? null, {
          name,
          trigger: when,
          condition: usesKeyword || usesStage || usesSource ? condition : null,
          actions: actions.map(({ type, value }) => ({ type, value })),
        }),
      { success: "Automatización guardada", onError: setError, onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(n) => {
        setOpen(n);
        setError(null);
        if (n) {
          // Always start from the saved values (props refresh after each save).
          setName(automation?.name ?? "");
          setWhen(automation?.trigger ?? "MESSAGE_RECEIVED");
          setCondition(automation?.condition ?? "");
          setActions(automation?.actions.length ? automation.actions.map(draft) : [draft()]);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{automation ? "Editar automatización" : "Nueva automatización"}</DialogTitle>
          <DialogDescription>Cuando pase algo en el CRM, haz estas acciones en orden.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Nombre" htmlFor="au_n">
            <Input id="au_n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Responder a quien pregunte por auditoría" maxLength={120} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cuando…" htmlFor="au_t">
              <NativeSelect
                id="au_t"
                value={when}
                onChange={(e) => {
                  const next = e.target.value as TriggerType;
                  setWhen(next);
                  setCondition(next === "DEAL_STAGE_CHANGED" ? "PROPOSAL_SENT" : "");
                  // A due-date wait only makes sense with cuenta de cobro triggers.
                  if (!DUE_TRIGGERS.includes(next)) setActions((list) => list.map((a) => (a.type === "wait_due" ? { ...a, type: "wait", value: "2d" } : a)));
                }}
              >
                {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {usesKeyword ? (
              <Field label="Si el mensaje contiene (opcional)" htmlFor="au_c">
                <Input id="au_c" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Ej.: precio" maxLength={120} />
              </Field>
            ) : usesStage ? (
              <Field label="Etapa a la que pasa" htmlFor="au_c">
                <NativeSelect id="au_c" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="">Cualquier etapa</option>
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : usesSource ? (
              <Field label="Si el contacto llega por (opcional)" htmlFor="au_c">
                <NativeSelect id="au_c" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="">Cualquier origen</option>
                  {Object.entries(CONTACT_SOURCE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <p className="self-end pb-2 text-[12.5px] text-muted-foreground">Este disparador no necesita condición.</p>
            )}
          </div>
          {usesKeyword ? (
            <p className="-mt-1 text-[12.5px] text-muted-foreground">No distingue mayúsculas ni tildes: “precio” también encuentra “PRECIO”.</p>
          ) : null}

          <div>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-[#3b475a]">Entonces…</span>
            <ol className="grid gap-2">
              {actions.map((a, i) => (
                <li key={a.key} className="grid gap-2 rounded-md border bg-[#fafbfc] p-2 sm:grid-cols-[236px_1fr_32px]">
                  <NativeSelect
                    aria-label={`Acción ${i + 1}`}
                    value={a.type}
                    onChange={(e) => {
                      const type = e.target.value as AutomationActionType;
                      update(a.key, { type, value: DEFAULT_VALUE[type] ?? "" });
                    }}
                  >
                    {(Object.keys(ACTION_LABEL) as AutomationActionType[])
                      .filter((t) => t !== "wait_due" || DUE_TRIGGERS.includes(when) || a.type === t)
                      .map((t) => (
                        <option key={t} value={t}>
                          {i + 1}. {ACTION_LABEL[t]}
                        </option>
                      ))}
                  </NativeSelect>
                  <ActionValue action={a} onChange={(value) => update(a.key, { value })} index={i} invoiceTrigger={INVOICE_TRIGGERS.includes(when)} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar acción ${i + 1}`}
                    disabled={actions.length === 1}
                    onClick={() => setActions((list) => list.filter((x) => x.key !== a.key))}
                    className="justify-self-end"
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={actions.length >= MAX_ACTIONS}
              onClick={() => setActions((list) => [...list, draft()])}
            >
              <Plus /> Agregar acción
            </Button>
          </div>

          <p className="text-[12.5px] text-muted-foreground">
            Variables en mensajes y tareas:{" "}
            {VARIABLES.map((v) => (
              <code key={v} className="mr-1 rounded bg-secondary px-1">
                {v}
              </code>
            ))}
            · Las acciones de una automatización no disparan otras automatizaciones.
          </p>
          <p className="-mt-1.5 text-[12.5px] text-muted-foreground">
            Con <strong>Esperar</strong> la automatización se pausa y sigue sola después. Pon <strong>Detener si…</strong> justo después de una espera para no escribirle a quien ya
            respondió o ya pagó.
          </p>
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

function ActionValue({ action, onChange, index, invoiceTrigger }: { action: DraftAction; onChange: (v: string) => void; index: number; invoiceTrigger: boolean }) {
  const label = `Valor de la acción ${index + 1}`;
  switch (action.type) {
    case "send_whatsapp":
      return <Textarea aria-label={label} rows={2} value={action.value} onChange={(e) => onChange(e.target.value)} placeholder="Hola {nombre}, gracias por escribir…" maxLength={1000} className="bg-white" />;
    case "move_stage":
      return (
        <NativeSelect aria-label={label} value={action.value} onChange={(e) => onChange(e.target.value)}>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      );
    case "add_tag":
      return <Input aria-label={label} value={action.value} onChange={(e) => onChange(e.target.value)} placeholder="Ej.: interesado" maxLength={40} className="bg-white" />;
    case "create_task":
      return <Input aria-label={label} value={action.value} onChange={(e) => onChange(e.target.value)} placeholder="Ej.: Llamar a {nombre} en 24 h" maxLength={300} className="bg-white" />;
    case "wait": {
      const m = WAIT_PATTERN.exec(action.value);
      const amount = m?.[1] ?? "";
      const unit = m?.[2] ?? "d";
      return (
        <div className="flex gap-2">
          <Input aria-label={`${label}: cantidad`} inputMode="numeric" value={amount} onChange={(e) => onChange(`${e.target.value.replace(/\D/g, "").slice(0, 4)}${unit}`)} className="w-24 bg-white" />
          <NativeSelect aria-label={`${label}: unidad`} value={unit} onChange={(e) => onChange(`${amount}${e.target.value}`)} className="w-32">
            <option value="m">minutos</option>
            <option value="h">horas</option>
            <option value="d">días</option>
          </NativeSelect>
        </div>
      );
    }
    case "wait_due": {
      const n = Number(action.value) || 0;
      const when = n < 0 ? "before" : n > 0 ? "after" : "on";
      const days = String(Math.abs(n));
      const set = (w: string, d: string) => onChange(w === "on" ? "0" : `${w === "before" ? "-" : ""}${Number(d.replace(/\D/g, "").slice(0, 2)) || 1}`);
      return (
        <div className="flex flex-wrap items-center gap-2">
          {when !== "on" ? (
            <Input aria-label={`${label}: días`} inputMode="numeric" value={days} onChange={(e) => set(when, e.target.value)} className="w-20 bg-white" />
          ) : null}
          <NativeSelect aria-label={`${label}: momento`} value={when} onChange={(e) => set(e.target.value, days === "0" ? "3" : days)} className="w-auto">
            <option value="before">días antes de la fecha límite</option>
            <option value="on">el día de la fecha límite</option>
            <option value="after">días después de la fecha límite</option>
          </NativeSelect>
          <span className="text-[12px] text-muted-foreground">a las 9:00</span>
        </div>
      );
    }
    case "stop_if":
      return (
        <NativeSelect aria-label={label} value={action.value} onChange={(e) => onChange(e.target.value)}>
          <option value="replied">El cliente respondió (desde que empezó)</option>
          {invoiceTrigger ? <option value="invoice_paid">La cuenta de cobro ya está pagada</option> : null}
          {STAGES.map((s) => (
            <option key={s.value} value={`stage:${s.value}`}>
              Tiene una oportunidad en {s.label}
            </option>
          ))}
        </NativeSelect>
      );
  }
}
