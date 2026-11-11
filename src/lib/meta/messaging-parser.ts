// Parses Messenger (object "page") and Instagram messaging (object "instagram") webhooks into flat, typed items.
// Both use entry[].messaging[] events: { sender.id, recipient.id, timestamp, message | delivery | read | postback | reaction }.
// Facebook Login path (one Page token for Messenger and the linked Instagram professional account).
// Lenient like the WhatsApp parser: unknown events are ignored, a malformed event is skipped.

import { z } from "zod";

export type SocialChannel = "FACEBOOK" | "INSTAGRAM";

const attachmentSchema = z
  .object({
    type: z.string(),
    payload: z.object({ url: z.string().optional(), title: z.string().optional() }).passthrough().nullable().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    mid: z.string(),
    text: z.string().optional(),
    is_echo: z.boolean().optional(),
    app_id: z.union([z.number(), z.string()]).optional(),
    is_deleted: z.boolean().optional(),
    is_unsupported: z.boolean().optional(),
    attachments: z.array(attachmentSchema).optional(),
    reply_to: z.object({ story: z.object({ url: z.string().optional(), id: z.string().optional() }).optional(), mid: z.string().optional() }).passthrough().optional(),
    quick_reply: z.object({ payload: z.string().optional() }).optional(),
  })
  .passthrough();

const eventSchema = z
  .object({
    sender: z.object({ id: z.string() }),
    recipient: z.object({ id: z.string() }),
    timestamp: z.number().optional(),
    message: messageSchema.optional(),
    delivery: z.object({ mids: z.array(z.string()).optional(), watermark: z.number().optional() }).optional(),
    read: z.object({ watermark: z.number().optional(), mid: z.string().optional() }).optional(),
    postback: z.object({ title: z.string().optional(), payload: z.string().optional(), mid: z.string().optional() }).optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({ id: z.string().optional(), messaging: z.array(z.unknown()).optional() }).passthrough()).default([]),
});

export type SocialItem =
  | { kind: "inbound"; channel: SocialChannel; accountId: string; peerId: string; mid: string; at: Date; type: string; body: string }
  | { kind: "echo"; channel: SocialChannel; accountId: string; peerId: string; mid: string; at: Date; type: string; body: string; appId: string | null }
  | { kind: "deleted"; channel: SocialChannel; mid: string }
  | { kind: "delivered"; channel: SocialChannel; peerId: string; mids: string[]; watermark: Date | null }
  | { kind: "read"; channel: SocialChannel; peerId: string; mid: string | null; watermark: Date | null }
  | { kind: "ignored"; reason: string };

const PLACEHOLDER: Record<string, string> = {
  image: "📷 Imagen",
  video: "🎬 Video",
  audio: "🎤 Audio",
  file: "📄 Archivo",
  location: "📍 Ubicación",
  share: "🔗 Publicación compartida",
  ig_reel: "🎬 Reel compartido",
  reel: "🎬 Reel compartido",
  story_mention: "📣 Te mencionó en su historia",
  fallback: "🔗 Enlace",
  template: "Mensaje con botones",
};

/** Meta sends milliseconds here; accept seconds too, just in case. */
export function toDate(ts: number | undefined): Date {
  if (!ts) return new Date();
  return new Date(ts < 1e12 ? ts * 1000 : ts);
}

/** Text of a message, or a readable placeholder for attachments, story replies and unsupported content. */
export function socialMessageBody(m: z.infer<typeof messageSchema>): { type: string; body: string } {
  if (m.is_unsupported) return { type: "unsupported", body: "Mensaje no soportado (míralo en la app)" };
  const first = m.attachments?.[0];
  const type = m.text ? "text" : (first?.type ?? "text");
  let body = m.text?.trim() ?? "";
  if (!body && first) {
    const extra = m.attachments!.length > 1 ? ` (+${m.attachments!.length - 1})` : "";
    body = `${PLACEHOLDER[first.type] ?? `[${first.type}]`}${first.payload?.title ? `: ${first.payload.title}` : ""}${extra}`;
  }
  if (m.reply_to?.story) body = `↩️ Respondió a tu historia${body ? `: ${body}` : ""}`;
  return { type, body: body || "Mensaje sin texto" };
}

function channelOf(object: string): SocialChannel | null {
  if (object === "page") return "FACEBOOK";
  if (object === "instagram") return "INSTAGRAM";
  return null;
}

/** True for payloads this parser handles (Messenger or Instagram messaging). */
export function isSocialPayload(payload: unknown): boolean {
  const object = (payload as { object?: unknown } | null)?.object;
  return object === "page" || object === "instagram";
}

export function parseSocialWebhook(payload: unknown): SocialItem[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  const channel = channelOf(parsed.data.object);
  if (!channel) return [{ kind: "ignored", reason: `object ${parsed.data.object}` }];

  const out: SocialItem[] = [];
  for (const entry of parsed.data.entry) {
    for (const raw of entry.messaging ?? []) {
      const r = eventSchema.safeParse(raw);
      if (!r.success) continue;
      const e = r.data;
      const at = toDate(e.timestamp);

      if (e.message) {
        const m = e.message;
        if (m.is_deleted) {
          out.push({ kind: "deleted", channel, mid: m.mid });
          continue;
        }
        const { type, body } = socialMessageBody(m);
        if (m.is_echo) {
          // Sent by the business: from the Page inbox / Instagram app, or by this CRM (app_id = our app).
          out.push({ kind: "echo", channel, accountId: e.sender.id, peerId: e.recipient.id, mid: m.mid, at, type, body, appId: m.app_id != null ? String(m.app_id) : null });
        } else {
          out.push({ kind: "inbound", channel, accountId: e.recipient.id, peerId: e.sender.id, mid: m.mid, at, type, body });
        }
        continue;
      }
      if (e.postback) {
        const mid = e.postback.mid ?? `postback:${e.sender.id}:${e.timestamp ?? at.getTime()}`;
        out.push({ kind: "inbound", channel, accountId: e.recipient.id, peerId: e.sender.id, mid, at, type: "postback", body: e.postback.title || e.postback.payload || "Botón" });
        continue;
      }
      if (e.delivery) {
        out.push({ kind: "delivered", channel, peerId: e.sender.id, mids: e.delivery.mids ?? [], watermark: e.delivery.watermark ? toDate(e.delivery.watermark) : null });
        continue;
      }
      if (e.read) {
        out.push({ kind: "read", channel, peerId: e.sender.id, mid: e.read.mid ?? null, watermark: e.read.watermark ? toDate(e.read.watermark) : null });
        continue;
      }
      out.push({ kind: "ignored", reason: Object.keys(raw as object).filter((k) => !["sender", "recipient", "timestamp"].includes(k)).join(",") || "evento vacío" });
    }
  }
  return out;
}
