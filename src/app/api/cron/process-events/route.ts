import { timingSafeEqual } from "node:crypto";
import { processPendingEvents } from "@/lib/services/event-processor";

/**
 * Backup processor for domain events (automations normally run right after each change). Useful for
 * events created by webhooks/API (Phases 4–5). Needs `Authorization: Bearer $CRON_SECRET`.
 * Not scheduled in vercel.json yet: the Hobby plan only allows daily crons (decide in Phase 6).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { processed, runs } = await processPendingEvents(200);
  return Response.json({ data: { processed, automations: runs.length } });
}
