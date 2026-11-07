import "server-only";
import { refresh } from "next/cache";
import { after } from "next/server";
import { DomainError } from "@/lib/services/core";
import { processPendingEvents } from "@/lib/services/event-processor";
import { processOutbox } from "@/lib/services/whatsapp-outbox";
import { requireUser } from "@/lib/session";

export type AutomationSummary = { count: number; failed: number };
export type ActionResult<T = undefined> = { ok: true; data: T; automations?: AutomationSummary } | { ok: false; error: string };

/**
 * Wraps a server action body: checks the session (redirects to /login if missing), runs the
 * mutation, processes the domain events it emitted (automations run right away, like the prototype),
 * refreshes the client router, and turns DomainErrors into a Spanish message.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireUser();
  let data: T;
  try {
    data = await fn();
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Algo salió mal. Intenta de nuevo." };
  }

  // The change is already saved: an automation problem must not turn it into an error.
  let automations: AutomationSummary | undefined;
  try {
    const { runs } = await processPendingEvents();
    if (runs.length) automations = { count: runs.length, failed: runs.filter((r) => !r.ok).length };
  } catch (error) {
    console.error("Error ejecutando automatizaciones", error);
  }

  // Queued WhatsApp messages go out after the response (Graph API calls can take a few seconds).
  after(() => processOutbox().catch((error) => console.error("Error enviando WhatsApp", error)));

  refresh();
  return { ok: true, data, automations };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
