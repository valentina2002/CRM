import { randomBytes } from "node:crypto";
import { hmacSha256Header } from "@/lib/crypto";
import { toBogotaISO } from "@/lib/format";

// Outgoing webhooks (docs/04-api.md): pure helpers. The DB side lives in src/lib/services/webhooks-out.ts.

export const WEBHOOK_EVENTS = ["contact.created", "message.received", "message.sent", "deal.stage_changed", "invoice.paid", "invoice.overdue"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEventType, string> = {
  "contact.created": "Se crea un contacto",
  "message.received": "Llega un mensaje de un cliente",
  "message.sent": "El CRM envía un mensaje",
  "deal.stage_changed": "Una oportunidad cambia de etapa",
  "invoice.paid": "Se paga una cuenta de cobro",
  "invoice.overdue": "Una cuenta de cobro se vence",
};

/** Waits before retries 1–5: 1 min, 5 min, 30 min, 2 h, 12 h. */
export const RETRY_DELAYS_MS = [1, 5, 30, 120, 720].map((minutes) => minutes * 60_000);
/** First try + 5 retries. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** When to try again after attempt number `failedAttempt` (1-based) failed; null = give up. */
export function nextRetryAt(failedAttempt: number, now: Date = new Date()): Date | null {
  const delay = RETRY_DELAYS_MS[failedAttempt - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** The exact JSON text that is signed and sent. */
export function buildWebhookBody(event: { id: string; type: string; createdAt: Date }, data: unknown): string {
  return JSON.stringify({ id: `evt_${event.id}`, type: event.type, createdAt: toBogotaISO(event.createdAt), data });
}

export function webhookHeaders(eventType: string, body: string, secret: string, deliveryId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "User-Agent": "CRM-SEO-Webhooks/1.0",
    "X-CRM-Event": eventType,
    "X-CRM-Delivery": deliveryId,
    "X-CRM-Signature": hmacSha256Header(body, secret),
  };
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(":")) return h === "::" || h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:");
  return false;
}

/**
 * Destination URLs must be public HTTPS. `allowLocal` (development only) also accepts http and
 * localhost/private addresses so the feature can be tried on a PC.
 */
export function validateWebhookUrl(raw: string, options: { allowLocal?: boolean } = {}): { ok: true; url: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length > 500) return { ok: false, error: "La URL es demasiado larga" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Escribe una URL válida (https://…)" };
  }
  if (url.username || url.password) return { ok: false, error: "La URL no puede llevar usuario ni contraseña" };
  if (options.allowLocal) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "La URL debe empezar por https://" };
    return { ok: true, url: url.toString() };
  }
  if (url.protocol !== "https:") return { ok: false, error: "La URL debe empezar por https://" };
  if (isPrivateHost(url.hostname)) return { ok: false, error: "La URL debe ser pública (no localhost ni una red interna)" };
  return { ok: true, url: url.toString() };
}

/** Human status of a delivery row for the log in Ajustes. */
export function deliveryStatus(d: { ok: boolean; attempt: number; statusCode: number | null; nextTryAt: Date | null; lastAttemptAt: Date | null }) {
  if (d.ok) return { tone: "ok" as const, label: d.attempt > 1 ? `Entregado al intento ${d.attempt}` : "Entregado" };
  if (d.nextTryAt && !d.lastAttemptAt) return { tone: "pending" as const, label: "En cola" };
  if (d.nextTryAt) return { tone: "retry" as const, label: `Falló${d.statusCode ? ` (${d.statusCode})` : ""} · reintento ${d.attempt - 1} de ${RETRY_DELAYS_MS.length}` };
  return { tone: "failed" as const, label: `Falló${d.statusCode ? ` (${d.statusCode})` : ""}${d.attempt > 1 ? ` tras ${d.attempt} intentos` : ""}` };
}
