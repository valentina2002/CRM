"use client";

import { AlertTriangle, Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { markReadAction, retryMessageAction } from "@/app/(app)/conversaciones/actions";
import { Avatar } from "@/components/crm/chip";
import { useAction } from "@/components/crm/use-action";
import { Input } from "@/components/ui/input";
import type { Channel, MessageStatus, MessageVia } from "@/generated/prisma/enums";
import { formatDate, formatShortMoment, formatTime, initials, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChannelMark } from "./channel-badge";

/** Refreshes server data every few seconds while the tab is visible (new messages, delivery ticks). */
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}

/** Marks the open conversation as read whenever it has unread messages (also when new ones arrive while open). */
export function MarkRead({ contactId, unread }: { contactId: string; unread: number }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    const key = `${contactId}:${unread}`;
    if (unread > 0 && done.current !== key) {
      done.current = key;
      void markReadAction(contactId);
    }
  }, [contactId, unread]);
  return null;
}

export type ListItem = {
  contactId: string;
  name: string;
  company: string | null;
  unread: number;
  last: { body: string | null; direction: "IN" | "OUT"; sentAt: Date; channel: Channel } | null;
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ConversationList({ items, activeId }: { items: ListItem[]; activeId: string | null }) {
  const [query, setQuery] = useState("");
  const q = fold(useDeferredValue(query).trim());
  const list = q ? items.filter((i) => fold(`${i.name} ${i.company ?? ""}`).includes(q)) : items;

  return (
    <div className="flex max-h-[240px] min-h-0 flex-col border-b md:max-h-none md:border-r md:border-b-0">
      <div className="border-b p-2">
        <Input type="search" placeholder="Buscar conversación…" aria-label="Buscar conversación" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
      </div>
      <nav aria-label="Conversaciones" className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? <p className="p-4 text-center text-[13px] text-muted-foreground">Sin conversaciones.</p> : null}
        {list.map((c) => (
          <Link
            key={c.contactId}
            href={`/conversaciones?c=${c.contactId}`}
            scroll={false}
            aria-current={c.contactId === activeId ? "page" : undefined}
            className={cn("flex gap-2.5 border-b px-3.5 py-3 hover:bg-[#fafbfc]", c.contactId === activeId && "bg-success-soft hover:bg-success-soft")}
          >
            <Avatar initials={initials(c.name)} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.name}</div>
              <div className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
                {c.last ? <ChannelMark channel={c.last.channel} /> : null}
                <span className="truncate">{c.last ? `${c.last.direction === "OUT" ? "Tú: " : ""}${c.last.body ?? ""}` : "Sin mensajes"}</span>
              </div>
            </div>
            {c.unread ? (
              <span className="h-[18px] self-center rounded-[10px] bg-primary px-[7px] text-[11px] leading-[18px] font-semibold text-white">{c.unread}</span>
            ) : c.last ? (
              <span className="self-start text-[12px] text-muted-foreground">{formatShortMoment(c.last.sentAt)}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export type ThreadMessage = {
  id: string;
  channel: Channel;
  direction: "IN" | "OUT";
  via: MessageVia | null;
  status: MessageStatus;
  body: string | null;
  error: string | null;
  sentAt: Date;
  edited: boolean;
};

const VIA_LABEL: Record<MessageVia, { text: string; className: string }> = {
  APP: { text: "📱 App WhatsApp Business", className: "text-[#8a5a00]" },
  CRM: { text: "💻 CRM · Cloud API", className: "text-info" },
  AUTOMATION: { text: "⚡ Automatización", className: "text-[#7b3fc4]" },
  HISTORY: { text: "🕘 Historial importado", className: "text-muted-foreground" },
};

/** Where an outgoing message was written, worded for its channel. */
function viaText(via: MessageVia, channel: Channel): string {
  if (channel === "FACEBOOK" && via === "APP") return "📱 Bandeja de Facebook";
  if (channel === "INSTAGRAM" && via === "APP") return "📱 App de Instagram";
  if (channel !== "WHATSAPP" && via === "CRM") return "💻 CRM";
  return VIA_LABEL[via].text;
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case "QUEUED":
      return <Clock className="inline size-3" aria-label="En cola" />;
    case "SENT":
      return <Check className="inline size-3.5" aria-label="Enviado" />;
    case "DELIVERED":
      return <CheckCheck className="inline size-3.5" aria-label="Entregado" />;
    case "READ":
      return <CheckCheck className="inline size-3.5 text-[#34b7f1]" aria-label="Leído" />;
    case "FAILED":
      return <AlertTriangle className="inline size-3.5 text-destructive" aria-label="No enviado" />;
    default:
      return null;
  }
}

export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  const end = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);
  const { pending, run } = useAction();

  if (messages.length === 0) return <p className="mt-6 text-center text-muted-foreground">Aún no hay mensajes con este contacto.</p>;

  const days = messages.map((m) => todayISO(m.sentAt));
  return (
    <>
      {messages.map((m, i) => {
        const separator = i === 0 || days[i] !== days[i - 1];
        const me = m.direction === "OUT";
        return (
          <div key={m.id}>
            {separator ? (
              <div className="my-3 text-center">
                <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11.5px] text-muted-foreground shadow-sm">{formatDate(m.sentAt)}</span>
              </div>
            ) : null}
            <div className={cn("mb-2.5 flex max-w-[78%] flex-col", me && "ml-auto items-end")}>
              <div className={cn("rounded-[10px] px-[11px] py-2 break-words whitespace-pre-wrap shadow-[0_1px_1px_rgba(0,0,0,.06)]", me ? "bg-[#d9fdd3]" : "bg-white")}>
                {m.body}
              </div>
              <div className="mt-[3px] flex flex-wrap items-center justify-end gap-1 text-[11px] text-[#6d7686]">
                <ChannelMark channel={m.channel} />
                <span>{formatTime(m.sentAt)}</span>
                {m.edited ? <span>· editado</span> : null}
                {me && m.via ? <span className={cn("font-semibold", VIA_LABEL[m.via].className)}>· {viaText(m.via, m.channel)}</span> : null}
                {me ? (
                  <span className="flex items-center gap-0.5">
                    · <StatusIcon status={m.status} />
                    {m.status === "QUEUED" ? " en cola" : null}
                  </span>
                ) : null}
              </div>
              {m.status === "FAILED" ? (
                <div className="mt-1 max-w-full rounded-md bg-danger-soft px-2 py-1 text-[11.5px] text-destructive">
                  {m.error ?? "No se pudo enviar"}{" "}
                  <button type="button" disabled={pending} className="ml-1 inline-flex cursor-pointer items-center gap-0.5 font-semibold underline" onClick={() => run(() => retryMessageAction(m.id), { success: "Reintentando…" })}>
                    <RotateCcw className="size-3" /> Reintentar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </>
  );
}

