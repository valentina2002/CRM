// Parses WhatsApp Business Account webhooks (Cloud API + coexistence) into flat, typed items.
// Field reference (Meta docs, nov 2026): messages (+ statuses), smb_message_echoes, history, smb_app_state_sync.
// Lenient: unknown fields are ignored; a malformed item is skipped instead of failing the whole payload.

import { z } from "zod";

const contactSchema = z.object({
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
  profile: z.object({ name: z.string().optional() }).partial().optional(),
});

/** Text, caption or a readable placeholder for non-text messages. */
const messageSchema = z
  .object({
    id: z.string(),
    from: z.string().optional(),
    from_user_id: z.string().optional(),
    to: z.string().optional(),
    to_user_id: z.string().optional(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    image: z.object({ id: z.string().optional(), caption: z.string().optional() }).optional(),
    video: z.object({ id: z.string().optional(), caption: z.string().optional() }).optional(),
    document: z.object({ id: z.string().optional(), caption: z.string().optional(), filename: z.string().optional() }).optional(),
    audio: z.object({ id: z.string().optional() }).optional(),
    sticker: z.object({ id: z.string().optional() }).optional(),
    button: z.object({ text: z.string().optional() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string() }).optional(),
        list_reply: z.object({ title: z.string() }).optional(),
      })
      .optional(),
    reaction: z.object({ emoji: z.string().optional() }).optional(),
    location: z.object({ name: z.string().optional(), address: z.string().optional() }).optional(),
    edit: z
      .object({ original_message_id: z.string().optional(), message: z.object({ text: z.object({ body: z.string() }).optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
    revoke: z.object({ original_message_id: z.string().optional() }).optional(),
    history_context: z.object({ status: z.string() }).optional(),
  })
  .passthrough();
type RawMessage = z.infer<typeof messageSchema>;

const PLACEHOLDER: Record<string, string> = {
  image: "📷 Imagen",
  video: "🎬 Video",
  audio: "🎤 Audio",
  document: "📄 Documento",
  sticker: "Sticker",
  location: "📍 Ubicación",
  contacts: "👤 Contacto",
  reaction: "Reacción",
  media_placeholder: "📎 Archivo (se descarga aparte)",
  unsupported: "Mensaje no soportado",
};

export function messageBody(m: RawMessage): string {
  if (m.text?.body) return m.text.body;
  const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption;
  if (m.type === "document" && m.document?.filename) return `📄 ${m.document.filename}${caption ? ` — ${caption}` : ""}`;
  if (caption) return `${PLACEHOLDER[m.type] ?? m.type}: ${caption}`;
  if (m.button?.text) return m.button.text;
  if (m.interactive?.button_reply?.title) return m.interactive.button_reply.title;
  if (m.interactive?.list_reply?.title) return m.interactive.list_reply.title;
  if (m.type === "reaction") return `Reaccionó ${m.reaction?.emoji ?? ""}`.trim();
  if (m.type === "location") return `📍 ${[m.location?.name, m.location?.address].filter(Boolean).join(" · ") || "Ubicación"}`;
  return PLACEHOLDER[m.type] ?? `[${m.type}]`;
}

const statusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  recipient_user_id: z.string().optional(),
  errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() }).passthrough()).optional(),
});

const stateSyncSchema = z.object({
  type: z.string(),
  action: z.enum(["add", "remove"]).or(z.string()),
  contact: z
    .object({ full_name: z.string().optional(), first_name: z.string().optional(), phone_number: z.string().optional(), user_id: z.string().optional() })
    .optional(),
  metadata: z.object({ timestamp: z.string().optional() }).optional(),
});

const historyChunkSchema = z.object({
  metadata: z.object({ phase: z.number().optional(), chunk_order: z.number().optional(), progress: z.number().optional() }).optional(),
  threads: z
    .array(
      z.object({
        id: z.string().optional(),
        context: z.object({ wa_id: z.string().optional(), user_id: z.string().optional() }).optional(),
        messages: z.array(z.unknown()).default([]),
      }),
    )
    .optional(),
  errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() }).passthrough()).optional(),
});

const valueSchema = z
  .object({
    metadata: z.object({ phone_number_id: z.string().optional(), display_phone_number: z.string().optional() }).optional(),
    contacts: z.array(contactSchema).optional(),
    messages: z.array(z.unknown()).optional(),
    statuses: z.array(z.unknown()).optional(),
    message_echoes: z.array(z.unknown()).optional(),
    state_sync: z.array(z.unknown()).optional(),
    history: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const webhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(z.object({ id: z.string().optional(), changes: z.array(z.object({ field: z.string(), value: z.unknown() })).default([]) }))
    .default([]),
});

/** Person on the other side: phone (wa_id, digits) and/or business-scoped user id (BSUID). */
export type Peer = { waId: string | null; userId: string | null; name: string | null };

export type ParsedItem =
  | { kind: "inbound"; phoneNumberId: string | null; peer: Peer; wamid: string; at: Date; type: string; body: string }
  | { kind: "status"; wamid: string; status: "sent" | "delivered" | "read" | "failed" | "other"; at: Date; error: string | null }
  | { kind: "echo"; phoneNumberId: string | null; peer: Peer; wamid: string; at: Date; type: string; body: string; editOf: string | null; revokes: string | null }
  | { kind: "history_message"; peer: Peer; wamid: string; at: Date; type: string; body: string; fromBusiness: boolean; status: string | null }
  | { kind: "history_progress"; phase: number | null; chunk: number | null; progress: number | null }
  | { kind: "history_error"; code: number | null; message: string }
  | { kind: "contact_sync"; action: "add" | "remove"; peer: Peer }
  | { kind: "ignored"; field: string };

const toDate = (ts: string) => new Date(Number(ts) * 1000);
const digits = (s: string | undefined | null) => (s ? s.replace(/\D/g, "") || null : null);

function parseList<T>(schema: z.ZodType<T>, list: unknown[] | undefined): T[] {
  return (list ?? []).flatMap((item) => {
    const r = schema.safeParse(item);
    return r.success ? [r.data] : [];
  });
}

function statusOf(raw: string): "sent" | "delivered" | "read" | "failed" | "other" {
  const s = raw.toLowerCase();
  if (s === "played") return "read";
  return s === "sent" || s === "delivered" || s === "read" || s === "failed" ? s : "other";
}

function parseHistory(chunks: unknown[] | undefined, businessNumber: string | null, out: ParsedItem[]) {
  for (const chunk of parseList(historyChunkSchema, chunks)) {
    for (const e of chunk.errors ?? []) out.push({ kind: "history_error", code: e.code ?? null, message: e.message ?? e.title ?? "Error de historial" });
    if (chunk.metadata) {
      out.push({ kind: "history_progress", phase: chunk.metadata.phase ?? null, chunk: chunk.metadata.chunk_order ?? null, progress: chunk.metadata.progress ?? null });
    }
    for (const thread of chunk.threads ?? []) {
      const peer: Peer = { waId: digits(thread.context?.wa_id ?? thread.id), userId: thread.context?.user_id ?? null, name: null };
      for (const m of parseList(messageSchema, thread.messages)) {
        const fromBusiness = businessNumber ? digits(m.from) === businessNumber : digits(m.from) !== peer.waId;
        out.push({
          kind: "history_message",
          peer,
          wamid: m.id,
          at: toDate(m.timestamp),
          type: m.type,
          body: messageBody(m),
          fromBusiness,
          status: m.history_context?.status?.toLowerCase() ?? null,
        });
      }
    }
  }
}

/** Flattens a webhook payload into items. Also accepts the bare `{ history: [...] }` error payload. */
export function parseWebhook(payload: unknown): ParsedItem[] {
  const out: ParsedItem[] = [];

  // Declined-history payload documented without object/entry/field.
  if (payload && typeof payload === "object" && !("entry" in payload) && "history" in payload) {
    parseHistory((payload as { history?: unknown[] }).history, null, out);
    return out;
  }

  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) return out;

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const value = valueSchema.safeParse(change.value);
      if (!value.success) continue;
      const v = value.data;
      const phoneNumberId = v.metadata?.phone_number_id ?? null;
      const businessNumber = digits(v.metadata?.display_phone_number);
      const contacts = v.contacts ?? [];
      const nameFor = (waId: string | null, userId: string | null) =>
        contacts.find((c) => (waId && c.wa_id === waId) || (userId && c.user_id === userId))?.profile?.name ?? null;

      switch (change.field) {
        case "messages": {
          for (const m of parseList(messageSchema, v.messages)) {
            const waId = digits(m.from);
            const userId = m.from_user_id ?? null;
            out.push({ kind: "inbound", phoneNumberId, peer: { waId, userId, name: nameFor(waId, userId) }, wamid: m.id, at: toDate(m.timestamp), type: m.type, body: messageBody(m) });
          }
          for (const s of parseList(statusSchema, v.statuses)) {
            const err = s.errors?.[0];
            out.push({
              kind: "status",
              wamid: s.id,
              status: statusOf(s.status),
              at: toDate(s.timestamp),
              error: err ? `${err.code ?? ""} ${err.message ?? err.title ?? ""}`.trim() : null,
            });
          }
          break;
        }
        case "smb_message_echoes": {
          for (const m of parseList(messageSchema, v.message_echoes)) {
            const waId = digits(m.to);
            const userId = m.to_user_id ?? null;
            out.push({
              kind: "echo",
              phoneNumberId,
              peer: { waId, userId, name: nameFor(waId, userId) },
              wamid: m.id,
              at: toDate(m.timestamp),
              type: m.type,
              body: m.type === "revoke" ? "Mensaje eliminado" : m.type === "edit" ? (m.edit?.message?.text?.body ?? "Mensaje editado") : messageBody(m),
              editOf: m.type === "edit" ? (m.edit?.original_message_id ?? null) : null,
              revokes: m.type === "revoke" ? (m.revoke?.original_message_id ?? null) : null,
            });
          }
          break;
        }
        case "history":
          parseHistory(v.history, businessNumber, out);
          break;
        case "smb_app_state_sync": {
          for (const s of parseList(stateSyncSchema, v.state_sync)) {
            if (s.type !== "contact" || !s.contact) continue;
            out.push({
              kind: "contact_sync",
              action: s.action === "remove" ? "remove" : "add",
              peer: { waId: digits(s.contact.phone_number), userId: s.contact.user_id ?? null, name: s.contact.full_name ?? s.contact.first_name ?? null },
            });
          }
          break;
        }
        default:
          out.push({ kind: "ignored", field: change.field });
      }
    }
  }
  return out;
}
