"use client";

import { FileText, Send } from "lucide-react";
import { useRef, useState } from "react";
import { listTemplatesAction, sendMessageAction, sendTemplateAction, simulateAction } from "@/app/(app)/conversaciones/actions";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Channel } from "@/generated/prisma/enums";
import { CHANNEL_LABEL } from "@/lib/constants";
import { fillTemplate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChannelMark } from "./channel-badge";

const QUICK = ["Hola {nombre}, ¿cómo estás?", "Te comparto el informe SEO del mes.", "¿Agendamos una llamada esta semana?", "Te envío la cuenta de cobro del mes."];

export type ComposerChannel = { channel: Channel; label: string; handle: string | null; windowOpen: boolean; connected: boolean };

type Props = {
  contactId: string;
  firstName: string;
  company: string;
  /** Channels this contact can be written to (WhatsApp if it has a number, Facebook / Instagram if it wrote there). */
  channels: ComposerChannel[];
  /** The channel the customer last wrote on. */
  defaultChannel: Channel | null;
  simulator: boolean;
};

export function Composer({ contactId, firstName, company, channels, defaultChannel, simulator }: Props) {
  const [text, setText] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [chosen, setChosen] = useState<Channel | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction();
  const vars = { nombre: firstName, empresa: company };
  const active = channels.find((c) => c.channel === chosen) ?? channels.find((c) => c.channel === defaultChannel) ?? channels[0];

  function send() {
    const body = text.trim();
    if (!body || !active) return;
    run(() => sendMessageAction(contactId, body, active.channel), {
      onSuccess: () => {
        setText("");
        input.current?.focus();
      },
    });
  }

  if (!active) {
    return (
      <div className="border-t">
        <p className="bg-[#fafbfc] p-3 text-[13px] text-muted-foreground">Este contacto no tiene número de WhatsApp. Agrégalo en su ficha para escribirle.</p>
        {simulator ? <Simulator contactId={contactId} channel="FACEBOOK" hasIdentity={false} /> : null}
      </div>
    );
  }

  const isWhatsApp = active.channel === "WHATSAPP";
  const maxLength = isWhatsApp ? 4096 : 1000;

  return (
    <div className="border-t">
      {channels.length > 1 ? (
        <div role="radiogroup" aria-label="Canal para responder" className="flex flex-wrap items-center gap-1.5 border-b bg-[#fafbfc] px-3 py-1.5">
          <span className="text-[12px] text-muted-foreground">Responder por:</span>
          {channels.map((c) => (
            <button
              key={c.channel}
              type="button"
              role="radio"
              aria-checked={c.channel === active.channel}
              onClick={() => setChosen(c.channel)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-[3px] text-[12px] font-medium",
                c.channel === active.channel ? "border-primary bg-success-soft text-primary" : "bg-white text-[#3d4a5e] hover:bg-secondary",
              )}
            >
              <ChannelMark channel={c.channel} /> {c.label}
              {c.channel === defaultChannel ? <span className="font-normal text-muted-foreground">· último</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {!active.connected ? (
        <p className="bg-warning-soft px-3 py-1.5 text-[12.5px] text-warning">
          {active.label} no está conectado: lo que envíes queda en cola y sale al conectarlo en <a href="/ajustes" className="font-semibold underline">Ajustes</a>.
        </p>
      ) : null}
      {active.windowOpen ? (
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
            <Input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isWhatsApp ? "Escribe un mensaje… (se envía por la Cloud API)" : `Escribe un mensaje… (se envía por ${active.label})`}
              aria-label={`Mensaje por ${active.label}`}
              maxLength={maxLength}
            />
            <Button type="submit" disabled={pending || !text.trim()}>
              <Send /> Enviar
            </Button>
          </form>
        </>
      ) : isWhatsApp ? (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
            <strong className="text-foreground">Ventana de 24 h cerrada:</strong> solo puedes enviar una plantilla aprobada (o responder desde el celular).
          </p>
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <FileText /> Enviar plantilla
          </Button>
        </div>
      ) : (
        <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
          <strong className="text-foreground">Ventana de 24 h cerrada:</strong> en {active.label} solo puedes responder durante las 24 horas siguientes al último mensaje del
          cliente. Respóndele desde {active.channel === "FACEBOOK" ? "la bandeja de tu página" : "la app de Instagram"} o espera a que te escriba.
        </p>
      )}
      {isWhatsApp && active.windowOpen ? (
        <div className="px-3 pb-2">
          <button type="button" className="cursor-pointer text-[12px] text-muted-foreground underline" onClick={() => setTemplatesOpen(true)}>
            Usar una plantilla aprobada
          </button>
        </div>
      ) : null}
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} contactId={contactId} vars={vars} />
      {simulator ? <Simulator contactId={contactId} channel={active.channel} hasIdentity /> : null}
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

const SIM_CHANNELS: Channel[] = ["WHATSAPP", "FACEBOOK", "INSTAGRAM"];
const SIM_ECHO: Record<string, string> = { WHATSAPP: "Responder desde el celular", FACEBOOK: "Responder desde Facebook", INSTAGRAM: "Responder desde Instagram" };

/** Dev-only: fakes Meta webhooks through the real pipeline (same idea as the prototype's SIMULADOR). */
function Simulator({ contactId, channel, hasIdentity }: { contactId: string; channel: Channel; hasIdentity: boolean }) {
  const [text, setText] = useState("");
  const [simChannel, setSimChannel] = useState<Channel | null>(null);
  const { pending, run } = useAction();
  const via = simChannel ?? channel;
  const simulate = (kind: "inbound" | "echo") =>
    run(() => simulateAction(contactId, kind, text.trim() || (kind === "inbound" ? "Hola, ¿cuál es el precio del plan?" : "Te respondo desde el celular 👍"), via), {
      onSuccess: (data) => {
        setText("");
        if (data?.newContact) toast.success(`Llegó como contacto nuevo de ${CHANNEL_LABEL[via]}: búscalo en la lista y fusiónalo desde su ficha`);
        else toast.success(kind === "inbound" ? "Llegó un mensaje simulado" : "Respuesta sincronizada");
      },
    });
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed bg-[#fbfbfc] px-3 py-2">
      <span className="text-[12px] font-semibold text-muted-foreground">SIMULADOR (solo desarrollo)</span>
      <NativeSelect aria-label="Canal simulado" className="h-8 w-[130px]" value={via} onChange={(e) => setSimChannel(e.target.value as Channel)}>
        {SIM_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {CHANNEL_LABEL[c]}
          </option>
        ))}
      </NativeSelect>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: ¿Cuál es el precio del plan?" aria-label="Texto simulado" className="h-8 min-w-[160px] flex-1" />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => simulate("inbound")}>
        Llega mensaje del cliente
      </Button>
      <Button variant="outline" size="sm" disabled={pending || (!hasIdentity && via !== "WHATSAPP")} onClick={() => simulate("echo")}>
        {SIM_ECHO[via]}
      </Button>
    </div>
  );
}
