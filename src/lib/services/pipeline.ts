import "server-only";
import { processPendingEvents } from "./event-processor";
import { processWebhookDeliveries } from "./webhooks-out";
import { processWebhookInbox } from "./whatsapp-inbox";
import { processOutbox } from "./whatsapp-outbox";

/**
 * Sends what is waiting to leave the CRM: queued WhatsApp messages, then the `message.sent` events they
 * produce, then the outgoing webhooks that are due. Runs after the response of UI actions and API calls.
 */
export async function flushOutgoing() {
  const outbox = await processOutbox();
  if (outbox.sent) await processPendingEvents();
  const deliveries = await processWebhookDeliveries();
  return { outbox, deliveries };
}

/**
 * Runs the background work in order: stored webhooks → domain events/automations → outgoing messages →
 * outgoing webhooks. Called after Meta webhooks and API calls (with `after()`), and by the cron route.
 */
export async function runBackgroundWork() {
  const webhooks = await processWebhookInbox();
  const events = await processPendingEvents();
  const { outbox, deliveries } = await flushOutgoing();
  return { webhooks, events, outbox, deliveries };
}
