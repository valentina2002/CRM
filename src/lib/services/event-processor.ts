import "server-only";
import type { Stage } from "@/generated/prisma/enums";
import { runAutomationsForEvent, type EngineEvent, type EnginePorts } from "@/lib/automation-engine";
import { STAGE_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { logActivity, type Tx } from "./core";
import { queueWebhookDeliveries } from "./webhooks-out";

/** DB implementation of the engine ports. No emit() here: automation actions never create events. */
function dbPorts(tx: Tx): EnginePorts {
  return {
    loadContact: (id) => tx.contact.findUnique({ where: { id }, select: { id: true, name: true, company: true, phone: true } }),

    async sendWhatsApp(contact, text) {
      // Saved as QUEUED in the unified thread; real delivery through the Cloud API arrives in Phase 4.
      const now = new Date();
      const conversation = await tx.conversation.upsert({
        where: { contactId: contact.id },
        update: { lastMessageAt: now, lastChannel: "WHATSAPP" },
        create: { contactId: contact.id, lastMessageAt: now, lastChannel: "WHATSAPP" },
      });
      await tx.message.create({
        data: { conversationId: conversation.id, channel: "WHATSAPP", direction: "OUT", via: "AUTOMATION", body: text, status: "QUEUED", sentAt: now },
      });
    },

    async addTag(contact, tag) {
      const current = await tx.contact.findUnique({ where: { id: contact.id }, select: { tags: true } });
      if (!current || current.tags.some((t) => t.toLocaleLowerCase("es-CO") === tag.toLocaleLowerCase("es-CO"))) return false;
      await tx.contact.update({ where: { id: contact.id }, data: { tags: { push: tag } } });
      await logActivity(tx, { type: "tag.added", text: `Etiqueta agregada: ${tag} (automatización)`, contactId: contact.id, data: { tag } });
      return true;
    },

    async moveStage(contact, stage: Stage) {
      const deals = await tx.deal.findMany({ where: { contactId: contact.id, stage: { notIn: ["LOST", stage] } } });
      for (const deal of deals) {
        await tx.deal.update({ where: { id: deal.id }, data: { stage } });
        await logActivity(tx, {
          type: "deal.stage_changed",
          text: `“${deal.title}” pasó de ${STAGE_LABEL[deal.stage]} a ${STAGE_LABEL[stage]} (automatización)`,
          contactId: contact.id,
          data: { dealId: deal.id, from: deal.stage, to: stage, automated: true },
        });
      }
      return deals.length;
    },

    async createTask(contact, text) {
      const task = await tx.task.create({ data: { text, contactId: contact.id } });
      await logActivity(tx, { type: "task.created", text: `Tarea creada: ${text} (automatización)`, contactId: contact.id, data: { taskId: task.id } });
    },

    async recordRun(run) {
      await tx.automationRun.create({ data: { automationId: run.automationId, eventId: run.eventId, ok: run.ok, detail: run.detail } });
    },
  };
}

function toEngineEvent(e: { id: string; type: string; payload: unknown }): EngineEvent | null {
  const p = e.payload as Record<string, unknown> | null;
  if (!p || typeof p.contactId !== "string") return null;
  return { id: e.id, type: e.type, payload: p } as EngineEvent;
}

/**
 * Processes pending domain events: runs matching automations (in one transaction per event), counts
 * runs, logs them, queues the outgoing webhooks and marks the event processed. Safe to call concurrently (events are claimed first).
 * Called right after each mutation (server actions) and by the backup cron route.
 */
export async function processPendingEvents(limit = 50) {
  const events = await db.event.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: limit });
  if (events.length === 0) return { processed: 0, runs: [] as { name: string; ok: boolean }[] };
  const automations = await db.automation.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });

  const runs: { name: string; ok: boolean }[] = [];
  let processed = 0;
  for (const event of events) {
    const claimed = await db.event.updateMany({ where: { id: event.id, status: "pending" }, data: { status: "processing" } });
    if (!claimed.count) continue;
    try {
      await db.$transaction(
        async (tx) => {
          const engineEvent = toEngineEvent(event);
          if (engineEvent) {
            const outcome = await runAutomationsForEvent(engineEvent, automations, dbPorts(tx));
            for (const r of outcome.ran) {
              await tx.automation.update({ where: { id: r.automationId }, data: { runCount: { increment: 1 } } });
              await logActivity(tx, {
                type: "automation.run",
                text: `Automatización “${r.name}” ${r.ok ? "ejecutada" : "ejecutada con errores"}`,
                contactId: engineEvent.payload.contactId,
                data: { automationId: r.automationId, eventId: event.id, ok: r.ok },
              });
              runs.push({ name: r.name, ok: r.ok });
            }
          }
          // Outgoing webhooks: one pending delivery per subscribed endpoint (sent by processWebhookDeliveries).
          await queueWebhookDeliveries(tx, event);
          await tx.event.update({ where: { id: event.id }, data: { status: "processed", processedAt: new Date() } });
        },
        { timeout: 15_000 },
      );
      processed++;
    } catch (error) {
      console.error(`Error procesando el evento ${event.id} (${event.type})`, error);
      await db.event.update({ where: { id: event.id }, data: { status: "failed", processedAt: new Date() } }).catch(() => {});
    }
  }
  return { processed, runs };
}
