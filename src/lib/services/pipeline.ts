import "server-only";
import { processPendingEvents } from "./event-processor";
import { processWebhookInbox } from "./whatsapp-inbox";
import { processOutbox } from "./whatsapp-outbox";

/**
 * Runs the background work in order: stored webhooks → domain events/automations → outgoing messages.
 * Called after webhooks (with `after()`), after UI mutations, and by the cron route.
 */
export async function runBackgroundWork() {
  const webhooks = await processWebhookInbox();
  const events = await processPendingEvents();
  const outbox = await processOutbox();
  return { webhooks, events, outbox };
}
