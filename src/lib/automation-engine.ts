// Automation engine: "cuando pasa X → haz Y". Pure logic over injectable ports, so it can be unit
// tested without a database (src/lib/automation-engine.test.ts) and run for real by
// src/lib/services/event-processor.ts.
//
// Loop rule (CLAUDE.md): actions executed by an automation NEVER emit events. The ports below have no
// way to emit, so an automation that moves a deal cannot trigger "deal.stage_changed" again.

import { z } from "zod";
import type { Stage, TriggerType } from "@/generated/prisma/enums";
import { STAGES } from "@/lib/constants";
import { fillTemplate, firstName, formatCOP } from "@/lib/format";

// ---------- schemas ----------

const stageValues = STAGES.map((s) => s.value) as [Stage, ...Stage[]];

export const automationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send_whatsapp"), value: z.string().trim().min(1, "Escribe el mensaje de WhatsApp").max(1000) }),
  z.object({ type: z.literal("add_tag"), value: z.string().trim().min(1, "Escribe la etiqueta").max(40) }),
  z.object({ type: z.literal("move_stage"), value: z.enum(stageValues, "Elige la etapa") }),
  z.object({ type: z.literal("create_task"), value: z.string().trim().min(1, "Escribe la tarea").max(300) }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const MAX_ACTIONS = 5;

export const automationInputSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(120),
    trigger: z.enum(["CONTACT_CREATED", "MESSAGE_RECEIVED", "DEAL_STAGE_CHANGED", "INVOICE_PAID", "INVOICE_OVERDUE"]),
    condition: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((v) => v || null),
    actions: z.array(automationActionSchema).min(1, "Agrega al menos una acción").max(MAX_ACTIONS, `Máximo ${MAX_ACTIONS} acciones`),
  })
  .superRefine((v, ctx) => {
    if (v.trigger === "DEAL_STAGE_CHANGED" && v.condition && !stageValues.includes(v.condition as Stage)) {
      ctx.addIssue({ code: "custom", path: ["condition"], message: "Elige una etapa válida" });
    }
    if (!["MESSAGE_RECEIVED", "DEAL_STAGE_CHANGED"].includes(v.trigger) && v.condition) {
      ctx.addIssue({ code: "custom", path: ["condition"], message: "Este disparador no usa condición" });
    }
  });
export type AutomationInput = z.output<typeof automationInputSchema>;

/** Parses the stored JSON actions, dropping anything invalid (never throws on old data). */
export function parseActions(raw: unknown): AutomationAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) => {
    const r = automationActionSchema.safeParse(a);
    return r.success ? [r.data] : [];
  });
}

// ---------- events ----------

export type EngineEvent =
  | { id: string; type: "contact.created"; payload: { contactId: string } }
  | { id: string; type: "message.received"; payload: { contactId: string; text: string } }
  | { id: string; type: "deal.stage_changed"; payload: { contactId: string; dealId: string; from: Stage; to: Stage } }
  | { id: string; type: "invoice.paid"; payload: { contactId: string; invoiceId: string; number: string; total: number } }
  | { id: string; type: "invoice.overdue"; payload: { contactId: string; invoiceId: string; number: string; total: number } }
  | { id: string; type: "message.sent"; payload: { contactId: string } };

export const EVENT_TRIGGER: Partial<Record<EngineEvent["type"], TriggerType>> = {
  "contact.created": "CONTACT_CREATED",
  "message.received": "MESSAGE_RECEIVED",
  "deal.stage_changed": "DEAL_STAGE_CHANGED",
  "invoice.paid": "INVOICE_PAID",
  "invoice.overdue": "INVOICE_OVERDUE",
};

export type AutomationDef = { id: string; name: string; trigger: TriggerType; condition: string | null; active: boolean; actions: unknown };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-CO");

/** Does this automation react to this event? (keyword: contains, ignoring case and accents; stage: exact). */
export function matches(automation: AutomationDef, event: EngineEvent): boolean {
  if (!automation.active || EVENT_TRIGGER[event.type] !== automation.trigger) return false;
  const condition = automation.condition?.trim();
  if (!condition) return true;
  if (event.type === "message.received") return fold(event.payload.text).includes(fold(condition));
  if (event.type === "deal.stage_changed") return event.payload.to === condition;
  return true;
}

// ---------- execution ----------

export type EngineContact = { id: string; name: string; company: string | null; phone: string | null };

/** Side effects the engine may perform. Deliberately has no way to emit events. */
export type EnginePorts = {
  loadContact(contactId: string): Promise<EngineContact | null>;
  sendWhatsApp(contact: EngineContact, text: string): Promise<void>;
  addTag(contact: EngineContact, tag: string): Promise<boolean>;
  moveStage(contact: EngineContact, stage: Stage): Promise<number>;
  createTask(contact: EngineContact, text: string): Promise<void>;
  recordRun(run: { automationId: string; eventId: string; ok: boolean; detail: RunDetail }): Promise<void>;
};

export type ActionResult = { type: AutomationAction["type"]; ok: boolean; message: string };
export type RunDetail = { contactId: string; contactName: string; eventType: string; actions: ActionResult[] };

export function templateVars(contact: EngineContact, event: EngineEvent) {
  const invoice = event.type === "invoice.paid" || event.type === "invoice.overdue" ? event.payload : null;
  return {
    nombre: firstName(contact.name),
    empresa: contact.company ?? "",
    factura: invoice?.number ?? "",
    valor: invoice ? formatCOP(invoice.total) : "",
  };
}

async function runAction(action: AutomationAction, contact: EngineContact, event: EngineEvent, ports: EnginePorts): Promise<ActionResult> {
  const vars = templateVars(contact, event);
  try {
    switch (action.type) {
      case "send_whatsapp": {
        if (!contact.phone) return { type: action.type, ok: false, message: "El contacto no tiene WhatsApp" };
        const text = fillTemplate(action.value, vars);
        await ports.sendWhatsApp(contact, text);
        return { type: action.type, ok: true, message: text };
      }
      case "add_tag": {
        const added = await ports.addTag(contact, action.value);
        return { type: action.type, ok: true, message: added ? `Etiqueta “${action.value}” agregada` : `Ya tenía la etiqueta “${action.value}”` };
      }
      case "move_stage": {
        const moved = await ports.moveStage(contact, action.value);
        return { type: action.type, ok: true, message: `${moved} oportunidad(es) movida(s)` };
      }
      case "create_task": {
        const text = fillTemplate(action.value, vars);
        await ports.createTask(contact, text);
        return { type: action.type, ok: true, message: text };
      }
    }
  } catch (error) {
    return { type: action.type, ok: false, message: error instanceof Error ? error.message : "Error desconocido" };
  }
}

export type EventOutcome = { ran: { automationId: string; name: string; ok: boolean }[] };

/**
 * Runs every active automation that matches the event, actions in order. A failing action is recorded
 * and the next ones still run (like the prototype). Returns what ran.
 */
export async function runAutomationsForEvent(event: EngineEvent, automations: AutomationDef[], ports: EnginePorts): Promise<EventOutcome> {
  const matching = automations.filter((a) => matches(a, event));
  if (matching.length === 0) return { ran: [] };
  const contact = await ports.loadContact(event.payload.contactId);
  if (!contact) return { ran: [] }; // contact deleted meanwhile

  const ran: EventOutcome["ran"] = [];
  for (const automation of matching) {
    const results: ActionResult[] = [];
    for (const action of parseActions(automation.actions)) results.push(await runAction(action, contact, event, ports));
    const ok = results.length > 0 && results.every((r) => r.ok);
    await ports.recordRun({
      automationId: automation.id,
      eventId: event.id,
      ok,
      detail: { contactId: contact.id, contactName: contact.name, eventType: event.type, actions: results },
    });
    ran.push({ automationId: automation.id, name: automation.name, ok });
  }
  return { ran };
}
