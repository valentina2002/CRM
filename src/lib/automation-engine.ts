// Automation engine: "cuando pasa X → haz Y". Pure logic over injectable ports, so it can be unit
// tested without a database (src/lib/automation-engine.test.ts) and run for real by
// src/lib/services/event-processor.ts.
//
// Loop rule (CLAUDE.md): actions executed by an automation NEVER emit events. The ports below have no
// way to emit, so an automation that moves a deal cannot trigger "deal.stage_changed" again.
//
// Phase 7: an automation can pause ("wait" N minutes/hours/days, or "wait_due" relative to the cuenta de
// cobro's due date) and stop early ("stop_if" the customer replied / the cuenta is paid / a deal is in a
// stage). A pause is handed to ports.schedule() and resumed later with resumeAutomation().

import { z } from "zod";
import type { Stage, TriggerType } from "@/generated/prisma/enums";
import { CONTACT_SOURCE_LABEL, STAGE_LABEL, STAGES } from "@/lib/constants";
import { fillTemplate, firstName, formatCOP, formatDateTime, formatDay } from "@/lib/format";

// ---------- schemas ----------

const stageValues = STAGES.map((s) => s.value) as [Stage, ...Stage[]];

/** "30m", "4h", "2d": 1 minute up to 90 days. */
export const WAIT_PATTERN = /^(\d{1,4})([mhd])$/;
const WAIT_UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const MAX_WAIT_MS = 90 * 86_400_000;

export function waitMs(value: string): number | null {
  const m = WAIT_PATTERN.exec(value);
  if (!m) return null;
  const ms = Number(m[1]) * WAIT_UNIT_MS[m[2] as keyof typeof WAIT_UNIT_MS];
  return ms >= 60_000 && ms <= MAX_WAIT_MS ? ms : null;
}

export const STOP_CONDITIONS = ["replied", "invoice_paid"] as const;
export const STOP_LABEL: Record<string, string> = {
  replied: "el cliente respondió",
  invoice_paid: "la cuenta de cobro ya está pagada",
};
const stopValue = z.string().refine((v) => (STOP_CONDITIONS as readonly string[]).includes(v) || (v.startsWith("stage:") && stageValues.includes(v.slice(6) as Stage)), "Elige cuándo detener");

const CONTINUE_LABEL: Record<string, string> = {
  replied: "el cliente no ha respondido",
  invoice_paid: "la cuenta de cobro sigue sin pagar",
};

/** Why the run goes on after a stop_if that did not stop it. */
export function continueLabel(value: string): string {
  return value.startsWith("stage:") ? `no tiene oportunidades en ${STAGE_LABEL[value.slice(6) as Stage] ?? value.slice(6)}` : (CONTINUE_LABEL[value] ?? value);
}

export function stopLabel(value: string): string {
  return value.startsWith("stage:") ? `tiene una oportunidad en ${STAGE_LABEL[value.slice(6) as Stage] ?? value.slice(6)}` : (STOP_LABEL[value] ?? value);
}

export const automationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send_whatsapp"), value: z.string().trim().min(1, "Escribe el mensaje de WhatsApp").max(1000) }),
  z.object({ type: z.literal("add_tag"), value: z.string().trim().min(1, "Escribe la etiqueta").max(40) }),
  z.object({ type: z.literal("move_stage"), value: z.enum(stageValues, "Elige la etapa") }),
  z.object({ type: z.literal("create_task"), value: z.string().trim().min(1, "Escribe la tarea").max(300) }),
  z.object({ type: z.literal("wait"), value: z.string().refine((v) => waitMs(v) !== null, "La espera debe ser entre 1 minuto y 90 días") }),
  // Days relative to the cuenta de cobro's due date: "-3" = 3 days before, "0" = that day, "5" = 5 days after (9:00 Bogotá).
  z.object({ type: z.literal("wait_due"), value: z.string().regex(/^-?\d{1,2}$/, "Escribe cuántos días antes (-) o después de la fecha límite") }),
  z.object({ type: z.literal("stop_if"), value: stopValue }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const MAX_ACTIONS = 8;

const INVOICE_TRIGGERS: TriggerType[] = ["INVOICE_SENT", "INVOICE_PAID", "INVOICE_OVERDUE"];
const DUE_TRIGGERS: TriggerType[] = ["INVOICE_SENT", "INVOICE_OVERDUE"];

export const automationInputSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(120),
    trigger: z.enum(["CONTACT_CREATED", "MESSAGE_RECEIVED", "DEAL_STAGE_CHANGED", "INVOICE_SENT", "INVOICE_PAID", "INVOICE_OVERDUE"]),
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
    if (v.trigger === "CONTACT_CREATED" && v.condition && !(v.condition in CONTACT_SOURCE_LABEL)) {
      ctx.addIssue({ code: "custom", path: ["condition"], message: "Elige un origen válido" });
    }
    if (!["MESSAGE_RECEIVED", "DEAL_STAGE_CHANGED", "CONTACT_CREATED"].includes(v.trigger) && v.condition) {
      ctx.addIssue({ code: "custom", path: ["condition"], message: "Este disparador no usa condición" });
    }
    v.actions.forEach((a, i) => {
      if (a.type === "wait_due" && !DUE_TRIGGERS.includes(v.trigger)) {
        ctx.addIssue({ code: "custom", path: ["actions", i], message: "“Esperar hasta la fecha límite” solo sirve cuando se envía o se vence una cuenta de cobro" });
      }
      if (a.type === "stop_if" && a.value === "invoice_paid" && !INVOICE_TRIGGERS.includes(v.trigger)) {
        ctx.addIssue({ code: "custom", path: ["actions", i], message: "“Si la cuenta ya está pagada” solo sirve con disparadores de cuentas de cobro" });
      }
    });
    const last = v.actions.at(-1);
    if (last && (last.type === "wait" || last.type === "wait_due" || last.type === "stop_if")) {
      ctx.addIssue({ code: "custom", path: ["actions"], message: "La última acción debe hacer algo (enviar, etiquetar, mover o crear tarea), no esperar ni detener" });
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

type InvoicePayload = { contactId: string; invoiceId: string; number: string; total: number; dueDate?: string };

export type EngineEvent =
  | { id: string; type: "contact.created"; payload: { contactId: string; source?: string } }
  | { id: string; type: "message.received"; payload: { contactId: string; text: string } }
  | { id: string; type: "deal.stage_changed"; payload: { contactId: string; dealId: string; from: Stage; to: Stage } }
  | { id: string; type: "invoice.sent"; payload: InvoicePayload }
  | { id: string; type: "invoice.paid"; payload: InvoicePayload }
  | { id: string; type: "invoice.overdue"; payload: InvoicePayload }
  | { id: string; type: "message.sent"; payload: { contactId: string } };

export const EVENT_TRIGGER: Partial<Record<EngineEvent["type"], TriggerType>> = {
  "contact.created": "CONTACT_CREATED",
  "message.received": "MESSAGE_RECEIVED",
  "deal.stage_changed": "DEAL_STAGE_CHANGED",
  "invoice.sent": "INVOICE_SENT",
  "invoice.paid": "INVOICE_PAID",
  "invoice.overdue": "INVOICE_OVERDUE",
};

export type AutomationDef = { id: string; name: string; trigger: TriggerType; condition: string | null; active: boolean; actions: unknown };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-CO");

/** Does this automation react to this event? (keyword: contains, ignoring case and accents; stage: exact; source: exact). */
export function matches(automation: AutomationDef, event: EngineEvent): boolean {
  if (!automation.active || EVENT_TRIGGER[event.type] !== automation.trigger) return false;
  const condition = automation.condition?.trim();
  if (!condition) return true;
  if (event.type === "message.received") return fold(event.payload.text).includes(fold(condition));
  if (event.type === "deal.stage_changed") return event.payload.to === condition;
  if (event.type === "contact.created") return event.payload.source === condition;
  return true;
}

/** "YYYY-MM-DD" + offset days at 9:00 Bogotá (UTC−5, no daylight saving) = 14:00 UTC. */
export function dueResumeAt(dueISO: string, offsetDays: number): Date {
  const d = new Date(`${dueISO.slice(0, 10)}T14:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

// ---------- execution ----------

/** `reachable`: the contact can be written to on another channel (Facebook / Instagram) even without a phone. */
export type EngineContact = { id: string; name: string; company: string | null; phone: string | null; reachable?: boolean };

export type PausedRun = { automationId: string; eventId: string; contactId: string; event: Pick<EngineEvent, "type" | "payload">; nextIndex: number; startedAt: Date; resumeAt: Date };

/** Side effects the engine may perform. Deliberately has no way to emit events. */
export type EnginePorts = {
  loadContact(contactId: string): Promise<EngineContact | null>;
  sendWhatsApp(contact: EngineContact, text: string): Promise<void>;
  addTag(contact: EngineContact, tag: string): Promise<boolean>;
  moveStage(contact: EngineContact, stage: Stage): Promise<number>;
  createTask(contact: EngineContact, text: string): Promise<void>;
  recordRun(run: { automationId: string; eventId: string; ok: boolean; detail: RunDetail }): Promise<void>;
  /** Phase 7 (optional so older fakes keep working): pauses and conditions. */
  now?(): Date;
  schedule?(run: PausedRun): Promise<void>;
  /** True when the run must stop: `condition` is a stop_if value. */
  shouldStop?(condition: string, ctx: { contactId: string; event: Pick<EngineEvent, "type" | "payload">; startedAt: Date }): Promise<boolean>;
};

export type ActionResult = { type: AutomationAction["type"]; ok: boolean; message: string };
export type RunDetail = {
  contactId: string;
  contactName: string;
  eventType: string;
  actions: ActionResult[];
  /** "resume" when this part ran after a wait. */
  segment?: "start" | "resume";
  /** Set when the run paused: ISO date it continues. */
  pausedUntil?: string;
  /** Set when a stop_if ended the run. */
  stopped?: string;
};

export function templateVars(contact: EngineContact, event: Pick<EngineEvent, "type" | "payload">) {
  const invoice = event.type === "invoice.sent" || event.type === "invoice.paid" || event.type === "invoice.overdue" ? (event.payload as InvoicePayload) : null;
  return {
    nombre: firstName(contact.name),
    empresa: contact.company ?? "",
    factura: invoice?.number ?? "",
    valor: invoice ? formatCOP(invoice.total) : "",
    vence: invoice?.dueDate ? formatDay(invoice.dueDate) : "",
  };
}

type Flow = { kind: "next" } | { kind: "pause"; resumeAt: Date } | { kind: "stop"; reason: string };

async function runAction(
  action: AutomationAction,
  contact: EngineContact,
  event: Pick<EngineEvent, "type" | "payload">,
  startedAt: Date,
  ports: EnginePorts,
): Promise<{ result: ActionResult; flow: Flow }> {
  const vars = templateVars(contact, event);
  const done = (ok: boolean, message: string, flow: Flow = { kind: "next" }) => ({ result: { type: action.type, ok, message }, flow });
  const now = ports.now?.() ?? new Date();
  try {
    switch (action.type) {
      case "send_whatsapp": {
        if (!contact.phone && !contact.reachable) return done(false, "El contacto no tiene WhatsApp");
        const text = fillTemplate(action.value, vars);
        await ports.sendWhatsApp(contact, text);
        return done(true, text);
      }
      case "add_tag": {
        const added = await ports.addTag(contact, action.value);
        return done(true, added ? `Etiqueta “${action.value}” agregada` : `Ya tenía la etiqueta “${action.value}”`);
      }
      case "move_stage": {
        const moved = await ports.moveStage(contact, action.value);
        return done(true, `${moved} oportunidad(es) movida(s)`);
      }
      case "create_task": {
        const text = fillTemplate(action.value, vars);
        await ports.createTask(contact, text);
        return done(true, text);
      }
      case "wait": {
        const resumeAt = new Date(now.getTime() + (waitMs(action.value) ?? 0));
        return done(true, `⏳ Espera hasta el ${formatDateTime(resumeAt)}`, { kind: "pause", resumeAt });
      }
      case "wait_due": {
        const due = (event.payload as InvoicePayload).dueDate;
        if (!due) return done(false, "El evento no tiene fecha límite: se omitió la espera");
        const resumeAt = dueResumeAt(due, Number(action.value));
        if (resumeAt <= now) return done(true, "La fecha ya pasó: continúa de inmediato");
        return done(true, `⏳ Espera hasta el ${formatDateTime(resumeAt)}`, { kind: "pause", resumeAt });
      }
      case "stop_if": {
        const stop = (await ports.shouldStop?.(action.value, { contactId: contact.id, event, startedAt })) ?? false;
        return stop ? done(true, `⏹ Se detuvo: ${stopLabel(action.value)}`, { kind: "stop", reason: stopLabel(action.value) }) : done(true, `Continúa: ${continueLabel(action.value)}`);
      }
    }
  } catch (error) {
    return done(false, error instanceof Error ? error.message : "Error desconocido");
  }
}

/** Runs actions from `fromIndex` until the end, a pause or a stop. Records one AutomationRun for this part. */
async function execute(
  automation: AutomationDef,
  contact: EngineContact,
  event: Pick<EngineEvent, "type" | "payload"> & { id: string },
  fromIndex: number,
  startedAt: Date,
  segment: "start" | "resume",
  ports: EnginePorts,
): Promise<{ ok: boolean; paused: boolean }> {
  const actions = parseActions(automation.actions);
  const results: ActionResult[] = [];
  let pausedUntil: Date | undefined;
  let stopped: string | undefined;

  for (let i = fromIndex; i < actions.length; i++) {
    const { result, flow } = await runAction(actions[i], contact, event, startedAt, ports);
    results.push(result);
    if (flow.kind === "stop") {
      stopped = flow.reason;
      break;
    }
    if (flow.kind === "pause") {
      if (!ports.schedule) {
        results[results.length - 1] = { ...result, ok: false, message: "Las esperas no están disponibles aquí" };
        break;
      }
      await ports.schedule({ automationId: automation.id, eventId: event.id, contactId: contact.id, event: { type: event.type, payload: event.payload }, nextIndex: i + 1, startedAt, resumeAt: flow.resumeAt });
      pausedUntil = flow.resumeAt;
      break;
    }
  }
  const ok = results.length > 0 && results.every((r) => r.ok);
  await ports.recordRun({
    automationId: automation.id,
    eventId: event.id,
    ok,
    detail: {
      contactId: contact.id,
      contactName: contact.name,
      eventType: event.type,
      actions: results,
      segment,
      ...(pausedUntil ? { pausedUntil: pausedUntil.toISOString() } : {}),
      ...(stopped ? { stopped } : {}),
    },
  });
  return { ok, paused: Boolean(pausedUntil) };
}

export type EventOutcome = { ran: { automationId: string; name: string; ok: boolean }[] };

/**
 * Runs every active automation that matches the event, actions in order. A failing action is recorded
 * and the next ones still run (like the prototype). A "wait" pauses that automation (ports.schedule) and
 * a "stop_if" ends it. Returns what ran.
 */
export async function runAutomationsForEvent(event: EngineEvent, automations: AutomationDef[], ports: EnginePorts): Promise<EventOutcome> {
  const matching = automations.filter((a) => matches(a, event));
  if (matching.length === 0) return { ran: [] };
  const contact = await ports.loadContact(event.payload.contactId);
  if (!contact) return { ran: [] }; // contact deleted meanwhile
  const startedAt = ports.now?.() ?? new Date();

  const ran: EventOutcome["ran"] = [];
  for (const automation of matching) {
    const { ok } = await execute(automation, contact, event, 0, startedAt, "start", ports);
    ran.push({ automationId: automation.id, name: automation.name, ok });
  }
  return { ran };
}

/**
 * Continues a paused run after its wait. Returns null (nothing ran) when the automation was paused or
 * deleted meanwhile, or the contact no longer exists: the caller cancels the job.
 */
export async function resumeAutomation(
  job: { eventId: string; contactId: string; event: Pick<EngineEvent, "type" | "payload">; nextIndex: number; startedAt: Date },
  automation: AutomationDef | null,
  ports: EnginePorts,
): Promise<{ ok: boolean; paused: boolean } | null> {
  if (!automation?.active) return null;
  const contact = await ports.loadContact(job.contactId);
  if (!contact) return null;
  return execute(automation, contact, { id: job.eventId, ...job.event }, job.nextIndex, job.startedAt, "resume", ports);
}

/** Readable summary of one action for cards and history. */
export function describeAction(a: AutomationAction): string {
  switch (a.type) {
    case "move_stage":
      return STAGE_LABEL[a.value];
    case "wait": {
      const m = WAIT_PATTERN.exec(a.value);
      if (!m) return a.value;
      const n = Number(m[1]);
      const unit = m[2] === "m" ? (n === 1 ? "minuto" : "minutos") : m[2] === "h" ? (n === 1 ? "hora" : "horas") : n === 1 ? "día" : "días";
      return `${n} ${unit}`;
    }
    case "wait_due": {
      const n = Number(a.value);
      if (n === 0) return "el día de la fecha límite";
      return `${Math.abs(n)} ${Math.abs(n) === 1 ? "día" : "días"} ${n < 0 ? "antes" : "después"} de la fecha límite`;
    }
    case "stop_if":
      return stopLabel(a.value);
    default:
      return a.value;
  }
}

