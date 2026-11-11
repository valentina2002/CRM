import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  buildWebhookBody,
  generateWebhookSecret,
  MAX_ATTEMPTS,
  nextRetryAt,
  validateWebhookUrl,
  WEBHOOK_EVENTS,
  webhookHeaders,
  type WebhookEventType,
} from "@/lib/webhooks/outgoing";
import { DomainError, logActivity, type Tx } from "./core";

const TIMEOUT_MS = 10_000;
/** While a delivery is being sent its nextTryAt moves this far ahead, so a crashed run is retried instead of lost. */
const LEASE_MS = 2 * 60_000;
const MAX_ENDPOINTS = 20;

const allowLocalUrls = () => process.env.NODE_ENV !== "production";

/** Creates an endpoint. The signing secret is returned here and never again (it is stored encrypted). */
export async function createWebhookEndpoint(input: { url: string; events: string[] }) {
  const checked = validateWebhookUrl(input.url, { allowLocal: allowLocalUrls() });
  if (!checked.ok) throw new DomainError(checked.error);
  const events = WEBHOOK_EVENTS.filter((e) => input.events.includes(e));
  if (events.length === 0) throw new DomainError("Elige al menos un evento");
  if ((await db.webhookEndpoint.count()) >= MAX_ENDPOINTS) throw new DomainError(`Puedes tener hasta ${MAX_ENDPOINTS} webhooks`, "conflict");

  const secret = generateWebhookSecret();
  let encrypted: string;
  try {
    encrypted = encryptSecret(secret);
  } catch {
    throw new DomainError("Falta ENCRYPTION_KEY en el servidor: se necesita para guardar el secreto del webhook.");
  }
  const endpoint = await db.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({ data: { url: checked.url, events, secret: encrypted } });
    await logActivity(tx, { type: "webhook.created", text: `Webhook saliente agregado: ${new URL(checked.url).host}` });
    return created;
  });
  return { id: endpoint.id, url: endpoint.url, events: endpoint.events, secret };
}

export async function setWebhookEndpointActive(id: string, active: boolean) {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new DomainError("Webhook no encontrado", "not_found");
  await db.webhookEndpoint.update({ where: { id }, data: { active } });
}

export async function deleteWebhookEndpoint(id: string) {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new DomainError("Webhook no encontrado", "not_found");
  await db.$transaction(async (tx) => {
    await tx.webhookEndpoint.delete({ where: { id } });
    await logActivity(tx, { type: "webhook.deleted", text: `Webhook saliente eliminado: ${new URL(endpoint.url).host}` });
  });
}

/** Endpoints for Ajustes (never includes the secret). */
export async function listWebhookEndpoints() {
  return db.webhookEndpoint.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });
}

export async function listRecentDeliveries(limit = 15) {
  return db.webhookDelivery.findMany({
    orderBy: [{ lastAttemptAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      eventType: true,
      attempt: true,
      statusCode: true,
      error: true,
      ok: true,
      nextTryAt: true,
      lastAttemptAt: true,
      createdAt: true,
      endpoint: { select: { url: true } },
    },
  });
}

/** Called by the event processor inside the event's transaction: one pending delivery per subscribed endpoint. */
export async function queueWebhookDeliveries(tx: Tx, event: { id: string; type: string }) {
  const endpoints = await tx.webhookEndpoint.findMany({ where: { active: true, events: { has: event.type } }, select: { id: true } });
  if (endpoints.length === 0) return 0;
  const now = new Date();
  const { count } = await tx.webhookDelivery.createMany({
    data: endpoints.map((e) => ({ endpointId: e.id, eventId: event.id, eventType: event.type, attempt: 1, nextTryAt: now })),
    skipDuplicates: true,
  });
  return count;
}

type SendResult = { ok: boolean; statusCode: number | null; error: string | null };

async function post(url: string, encryptedSecret: string, eventType: string, body: string, deliveryId: string): Promise<SendResult> {
  let secret: string;
  try {
    secret = decryptSecret(encryptedSecret);
  } catch {
    return { ok: false, statusCode: null, error: "No se pudo leer el secreto del webhook (¿cambió ENCRYPTION_KEY?)" };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: webhookHeaders(eventType, body, secret, deliveryId),
      body,
      redirect: "manual", // a redirect is not a delivery
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => {});
    const ok = response.status >= 200 && response.status < 300;
    return { ok, statusCode: response.status, error: ok ? null : `El destino respondió ${response.status}` };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, statusCode: null, error: timedOut ? `Sin respuesta en ${TIMEOUT_MS / 1000} s` : "No se pudo conectar con el destino" };
  }
}

/** The event payload plus a snapshot of the contact, so receivers (Zapier, Make, n8n) don't need a second call. */
async function eventData(payload: unknown) {
  const data = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (typeof data.contactId !== "string") return data;
  const contact = await db.contact.findUnique({
    where: { id: data.contactId },
    select: { id: true, name: true, company: true, phone: true, email: true, service: true, tags: true },
  });
  return { ...data, contact };
}

/**
 * Sends the deliveries that are due (first tries and retries: 1 min, 5 min, 30 min, 2 h, 12 h). Each one is
 * claimed first, so concurrent runs never send the same delivery twice.
 */
export async function processWebhookDeliveries(limit = 20, now: Date = new Date()) {
  const due = await db.webhookDelivery.findMany({
    where: { ok: false, nextTryAt: { lte: now }, endpoint: { active: true } },
    orderBy: { nextTryAt: "asc" },
    take: limit,
    include: { endpoint: true },
  });

  let delivered = 0;
  let failed = 0;
  await Promise.all(
    due.map(async (d) => {
      const claimed = await db.webhookDelivery.updateMany({
        where: { id: d.id, ok: false, nextTryAt: d.nextTryAt },
        data: { nextTryAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (!claimed.count) return;

      const event = await db.event.findUnique({ where: { id: d.eventId } });
      const result: SendResult = event
        ? await post(d.endpoint.url, d.endpoint.secret, event.type, buildWebhookBody(event, await eventData(event.payload)), d.id)
        : { ok: false, statusCode: null, error: "El evento ya no existe" };

      const attemptedAt = new Date();
      const retryAt = result.ok || !event ? null : nextRetryAt(d.attempt, attemptedAt);
      await db.webhookDelivery.update({
        where: { id: d.id },
        data: {
          ok: result.ok,
          statusCode: result.statusCode,
          error: result.error,
          lastAttemptAt: attemptedAt,
          nextTryAt: retryAt,
          attempt: retryAt ? Math.min(d.attempt + 1, MAX_ATTEMPTS) : d.attempt,
        },
      });
      if (result.ok) delivered++;
      else failed++;
    }),
  );
  return { delivered, failed };
}

/** "Probar": sends a `ping` event right now (no retries) and records it in the delivery log. */
export async function sendTestWebhook(endpointId: string) {
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint) throw new DomainError("Webhook no encontrado", "not_found");
  const now = new Date();
  const delivery = await db.webhookDelivery.create({
    data: { endpointId, eventId: `test_${now.getTime()}`, eventType: "ping", attempt: 1 },
  });
  const body = buildWebhookBody(
    { id: delivery.eventId, type: "ping", createdAt: now },
    { message: "Prueba de webhook desde el CRM", events: endpoint.events as WebhookEventType[] },
  );
  const result = await post(endpoint.url, endpoint.secret, "ping", body, delivery.id);
  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { ok: result.ok, statusCode: result.statusCode, error: result.error, lastAttemptAt: new Date() },
  });
  return result;
}
