"use client";

import { FileText, Send } from "lucide-react";
import { useRef, useState } from "react";
import { listTemplatesAction, sendMessageAction, sendTemplateAction, simulateAction } from "@/app/(app)/conversaciones/actions";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { fillTemplate } from "@/lib/format";

const QUICK = ["Hola {nombre}, ¿cómo estás?", "Te comparto el informe SEO del mes.", "¿Agendamos una llamada esta semana?", "Te envío la cuenta de cobro del mes."];

type Props = {
  contactId: string;
  firstName: string;
  company: string;
  hasPhone: boolean;
  windowOpen: boolean;
  connected: boolean;
  simulator: boolean;
};

export function Composer({ contactId, firstName, company, hasPhone, windowOpen, connected, simulator }: Props) {
  const [text, setText] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction();
  const vars = { nombre: firstName, empresa: company };

  function send() {
    const body = text.trim();
    if (!body) return;
    run(() => sendMessageAction(contactId, body), {
      onSuccess: () => {
        setText("");
        input.current?.focus();
      },
    });
  }

  if (!hasPhone) {
    return <p className="border-t bg-[#fafbfc] p-3 text-[13px] text-muted-foreground">Este contacto no tiene número de WhatsApp. Agrégalo en su ficha para escribirle.</p>;
  }

  return (
    <div className="border-t">
      {!connected ? (
        <p className="bg-warning-soft px-3 py-1.5 text-[12.5px] text-warning">
          WhatsApp no está conectado: lo que envíes queda en cola y sale al conectar tu número en <a href="/ajustes" className="font-semibold underline">Ajustes</a>.
        </p>
      ) : null}
      {windowOpen ? (
        <>
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [&::-webkit-scrollbar]:hidden">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                className="shrink-0 cursor-pointer rounded-full border bg-white px-2.5 py-[3px] text-[12px] whitespace-nowrap hover:bg-secondary"
                onClick={() => {
                  setText(fillTemplate(q, vars));
                  input.current?.focus();
                }}
              >
                {fillTemplate(q, vars)}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2 px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje… (se envía por la Cloud API)" aria-label="Mensaje" maxLength={4096} />
            <Button type="submit" disabled={pending || !text.trim()}>
              <Send /> Enviar
            </Button>
          </form>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
            <strong className="text-foreground">Ventana de 24 h cerrada:</strong> solo puedes enviar una plantilla aprobada (o responder desde el celular).
          </p>
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <FileText /> Enviar plantilla
          </Button>
        </div>
      )}
      {windowOpen ? (
        <div className="px-3 pb-2">
          <button type="button" className="cursor-pointer text-[12px] text-muted-foreground underline" onClick={() => setTemplatesOpen(true)}>
            Usar una plantilla aprobada
          </button>
        </div>
      ) : null}
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} contactId={contactId} vars={vars} />
      {simulator ? <Simulator contactId={contactId} /> : null}
    </div>
  );
}

type TemplateItem = { name: string; language: string; category: string; body: string };

function TemplatesDialog({ open, onOpenChange, contactId, vars }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string; vars: { nombre: string; empresa: string } }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; templates: TemplateItem[] }>({ loading: false, templates: [] });
  const [selected, setSelected] = useState(0);
  const [params, setParams] = useState<string[]>([]);
  const { pending, run } = useAction();
  const t = state.templates[selected];
  const count = t ? new Set(t.body.match(/\{\{\d+\}\}/g) ?? []).size : 0;
  const preview = t ? t.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] || `{{${n}}}`) : "";

  const pick = (i: number, list = state.templates) => {
    setSelected(i);
    const n = new Set(list[i]?.body.match(/\{\{\d+\}\}/g) ?? []).size;
    setParams(Array.from({ length: n }, (_, k) => (k === 0 ? vars.nombre : "")));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next && !state.templates.length) {
          setState({ loading: true, templates: [] });
          listTemplatesAction().then((r) => {
            if (!r.ok) return setState({ loading: false, error: r.error, templates: [] });
            setState({ loading: false, templates: r.templates });
            pick(0, r.templates);
          });
        }
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Enviar plantilla</DialogTitle>
          <DialogDescription>Plantillas aprobadas por Meta en tu cuenta de WhatsApp Business. Se pueden enviar aunque hayan pasado más de 24 h.</DialogDescription>
        </DialogHeader>
        {state.loading ? (
          <p className="text-muted-foreground">Cargando plantillas…</p>
        ) : state.error ? (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{state.error}</p>
        ) : state.templates.length === 0 ? (
          <p className="text-muted-foreground">No tienes plantillas aprobadas. Créalas en el Administrador de WhatsApp de Meta.</p>
        ) : (
          <div className="grid gap-3">
            <NativeSelect aria-label="Plantilla" value={selected} onChange={(e) => pick(Number(e.target.value))}>
              {state.templates.map((tp, i) => (
                <option key={`${tp.name}-${tp.language}`} value={i}>
                  {tp.name} ({tp.language}) · {tp.category}
                </option>
              ))}
            </NativeSelect>
            {Array.from({ length: count }, (_, i) => (
              <Input
                key={i}
                aria-label={`Variable {{${i + 1}}}`}
                placeholder={`Valor para {{${i + 1}}}`}
                value={params[i] ?? ""}
                onChange={(e) => setParams((p) => Object.assign([...p], { [i]: e.target.value }))}
              />
            ))}
            <div className="rounded-md bg-[#d9fdd3] px-3 py-2 text-[13px] whitespace-pre-wrap">{preview}</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!t || pending}
            onClick={() =>
              t &&
              run(() => sendTemplateAction({ contactId, name: t.name, language: t.language, params: params.slice(0, count), preview }), {
                success: "Plantilla en camino",
                onSuccess: () => onOpenChange(false),
              })
            }
          >
            Enviar plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dev-only: fakes Meta webhooks through the real pipeline (same idea as the prototype's SIMULADOR). */
function Simulator({ contactId }: { contactId: string }) {
  const [text, setText] = useState("");
  const { pending, run } = useAction();
  const simulate = (kind: "inbound" | "echo") =>
    run(() => simulateAction(contactId, kind, text.trim() || (kind === "inbound" ? "Hola, ¿cuál es el precio del plan?" : "Te respondo desde el celular 👍")), {
      success: kind === "inbound" ? "Llegó un mensaje simulado" : "Respuesta del celular sincronizada",
      onSuccess: () => setText(""),
    });
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed bg-[#fbfbfc] px-3 py-2">
      <span className="text-[12px] font-semibold text-muted-foreground">SIMULADOR (solo desarrollo)</span>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: ¿Cuál es el precio del plan?" aria-label="Texto simulado" className="h-8 min-w-[180px] flex-1" />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => simulate("inbound")}>
        Llega mensaje del cliente
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => simulate("echo")}>
        Responder desde el celular
      </Button>
    </div>
  );
}
