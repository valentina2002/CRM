import "server-only";
import { processDueAutomationJobs, processPendingEvents } from "./event-processor";
import { processSocialOutbox } from "./social-outbox";
import { processWebhookDeliveries } from "./webhooks-out";
import { processWebhookInbox } from "./whatsapp-inbox";
import { processOutbox } from "./whatsapp-outbox";

/**
 * Resumes automations whose wait is over, then sends what is waiting to leave the CRM: queued WhatsApp / Messenger / Instagram
 * messages, then the `message.sent` events they
 * produce, then the outgoing webhooks that are due. Runs after the response of UI actions and API calls.
 */
export async function flushOutgoing() {
  // Automations whose wait is over go first: what they send leaves in this same pass.
  const jobs = await processDueAutomationJobs();
  const whatsapp = await processOutbox();
  const social = await processSocialOutbox();
  const outbox = { sent: whatsapp.sent + social.sent, failed: whatsapp.failed + social.failed };
  if (outbox.sent) await processPendingEvents();
  const deliveries = await processWebhookDeliveries();
  return { outbox, deliveries, jobs };
}

/**
 * Runs the background work in order: stored webhooks → domain events/automations → outgoing messages →
 * outgoing webhooks. Called after Meta webhooks and API calls (with `after()`), and by the cron route.
 */
export async function runBackgroundWork() {
  const webhooks = await processWebhookInbox();
  const events = await processPendingEvents();
  const { outbox, deliveries, jobs } = await flushOutgoing();
  return { webhooks, events, outbox, deliveries, jobs };
}
