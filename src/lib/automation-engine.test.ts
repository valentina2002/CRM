import { describe, expect, it } from "vitest";
import type { Stage } from "@/generated/prisma/enums";
import {
  automationInputSchema,
  matches,
  parseActions,
  runAutomationsForEvent,
  type AutomationDef,
  type EngineContact,
  type EngineEvent,
  type EnginePorts,
  type RunDetail,
} from "./automation-engine";

// ---------- in-memory fake of the CRM, with an event queue like the real one ----------

function makeWorld() {
  const contacts = new Map<string, EngineContact & { tags: string[] }>([
    ["c1", { id: "c1", name: "Carlos Restrepo", company: "Clínica Dental Sonrisa", phone: "+573005550102", tags: ["lead"] }],
    ["c2", { id: "c2", name: "Paula Henao", company: null, phone: null, tags: [] }],
  ]);
  const deals = [
    { id: "d1", contactId: "c1", stage: "PROSPECT" as Stage },
    { id: "d2", contactId: "c1", stage: "LOST" as Stage },
  ];
  const messages: { contactId: string; text: string }[] = [];
  const tasks: { contactId: string; text: string }[] = [];
  const runs: { automationId: string; eventId: string; ok: boolean; detail: RunDetail }[] = [];
  const queue: EngineEvent[] = [];
  let seq = 0;

  /** What the UI/API does: changes data AND emits an event. */
  const userMovesDeal = (dealId: string, to: Stage) => {
    const d = deals.find((x) => x.id === dealId)!;
    const from = d.stage;
    d.stage = to;
    queue.push({ id: `e${++seq}`, type: "deal.stage_changed", payload: { contactId: d.contactId, dealId, from, to } });
  };

  /** What automations get: same effects, but no way to emit. */
  const ports: EnginePorts = {
    async loadContact(id) {
      const c = contacts.get(id);
      return c ? { id: c.id, name: c.name, company: c.company, phone: c.phone } : null;
    },
    async sendWhatsApp(c, text) {
      messages.push({ contactId: c.id, text });
    },
    async addTag(c, tag) {
      const contact = contacts.get(c.id)!;
      if (contact.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
      contact.tags.push(tag);
      return true;
    },
    async moveStage(c, stage) {
      const mine = deals.filter((d) => d.contactId === c.id && d.stage !== "LOST");
      mine.forEach((d) => (d.stage = stage));
      return mine.length;
    },
    async createTask(c, text) {
      tasks.push({ contactId: c.id, text });
    },
    async recordRun(run) {
      runs.push(run);
    },
  };

  /** Drains the queue like the event processor does. */
  const processAll = async (automations: AutomationDef[]) => {
    let guard = 0;
    while (queue.length) {
      if (++guard > 100) throw new Error("infinite loop");
      await runAutomationsForEvent(queue.shift()!, automations, ports);
    }
  };

  return { contacts, deals, messages, tasks, runs, queue, ports, userMovesDeal, processAll, nextId: () => `e${++seq}` };
}

const auto = (p: Partial<AutomationDef> & Pick<AutomationDef, "trigger" | "actions">): AutomationDef => ({
  id: p.id ?? "a1",
  name: p.name ?? "Prueba",
  active: p.active ?? true,
  condition: p.condition ?? null,
  ...p,
});

// ---------- triggers ----------

describe("matches (triggers and conditions)", () => {
  const msg = (text: string): EngineEvent => ({ id: "e1", type: "message.received", payload: { contactId: "c1", text } });

  it("contact created", () => {
    expect(matches(auto({ trigger: "CONTACT_CREATED", actions: [] }), { id: "e", type: "contact.created", payload: { contactId: "c1" } })).toBe(true);
  });

  it("incoming message with keyword (ignores case and accents)", () => {
    const a = auto({ trigger: "MESSAGE_RECEIVED", condition: "precio", actions: [] });
    expect(matches(a, msg("¿Cuál es el PRECIO del plan?"))).toBe(true);
    expect(matches(a, msg("Hola, ¿cuánto cuesta?"))).toBe(false);
    expect(matches(auto({ trigger: "MESSAGE_RECEIVED", condition: "auditoría", actions: [] }), msg("quiero una auditoria"))).toBe(true);
    expect(matches(auto({ trigger: "MESSAGE_RECEIVED", actions: [] }), msg("cualquier cosa"))).toBe(true);
  });

  it("stage change with exact stage", () => {
    const a = auto({ trigger: "DEAL_STAGE_CHANGED", condition: "PROPOSAL_SENT", actions: [] });
    const ev = (to: Stage): EngineEvent => ({ id: "e", type: "deal.stage_changed", payload: { contactId: "c1", dealId: "d1", from: "PROSPECT", to } });
    expect(matches(a, ev("PROPOSAL_SENT"))).toBe(true);
    expect(matches(a, ev("NEGOTIATION"))).toBe(false);
  });

  it("invoice paid / overdue", () => {
    const p = { contactId: "c1", invoiceId: "i1", number: "CC-002", total: 2400000 };
    expect(matches(auto({ trigger: "INVOICE_PAID", actions: [] }), { id: "e", type: "invoice.paid", payload: p })).toBe(true);
    expect(matches(auto({ trigger: "INVOICE_OVERDUE", actions: [] }), { id: "e", type: "invoice.overdue", payload: p })).toBe(true);
    expect(matches(auto({ trigger: "INVOICE_PAID", actions: [] }), { id: "e", type: "invoice.overdue", payload: p })).toBe(false);
  });

  it("paused automations never match; message.sent triggers nothing", () => {
    expect(matches(auto({ trigger: "CONTACT_CREATED", active: false, actions: [] }), { id: "e", type: "contact.created", payload: { contactId: "c1" } })).toBe(false);
    expect(matches(auto({ trigger: "CONTACT_CREATED", actions: [] }), { id: "e", type: "message.sent", payload: { contactId: "c1" } })).toBe(false);
  });
});

// ---------- actions ----------

describe("actions", () => {
  it("send_whatsapp fills {nombre} {empresa} {factura} {valor}", async () => {
    const w = makeWorld();
    await runAutomationsForEvent(
      { id: "e1", type: "invoice.paid", payload: { contactId: "c1", invoiceId: "i1", number: "CC-002", total: 2400000 } },
      [auto({ trigger: "INVOICE_PAID", actions: [{ type: "send_whatsapp", value: "¡Gracias {nombre} de {empresa}! Recibimos {factura} por {valor}." }] })],
      w.ports,
    );
    expect(w.messages).toHaveLength(1);
    expect(w.messages[0].text.replace(/\s/g, " ")).toBe("¡Gracias Carlos de Clínica Dental Sonrisa! Recibimos CC-002 por $ 2.400.000.");
    expect(w.runs[0].ok).toBe(true);
  });

  it("send_whatsapp fails (recorded) when the contact has no WhatsApp, next actions still run", async () => {
    const w = makeWorld();
    await runAutomationsForEvent(
      { id: "e1", type: "contact.created", payload: { contactId: "c2" } },
      [auto({ trigger: "CONTACT_CREATED", actions: [{ type: "send_whatsapp", value: "Hola {nombre}" }, { type: "create_task", value: "Llamar a {nombre}" }] })],
      w.ports,
    );
    expect(w.messages).toHaveLength(0);
    expect(w.tasks).toEqual([{ contactId: "c2", text: "Llamar a Paula" }]);
    expect(w.runs[0].ok).toBe(false);
    expect(w.runs[0].detail.actions.map((a) => a.ok)).toEqual([false, true]);
    expect(w.runs[0].detail.actions[0].message).toBe("El contacto no tiene WhatsApp");
  });

  it("add_tag adds once (case-insensitive)", async () => {
    const w = makeWorld();
    const a = auto({ trigger: "MESSAGE_RECEIVED", condition: "precio", actions: [{ type: "add_tag", value: "Interesado" }] });
    const ev = (id: string): EngineEvent => ({ id, type: "message.received", payload: { contactId: "c1", text: "precio?" } });
    await runAutomationsForEvent(ev("e1"), [a], w.ports);
    await runAutomationsForEvent(ev("e2"), [{ ...a, actions: [{ type: "add_tag", value: "interesado" }] }], w.ports);
    expect(w.contacts.get("c1")!.tags).toEqual(["lead", "Interesado"]);
  });

  it("move_stage moves the contact's open deals (not lost ones)", async () => {
    const w = makeWorld();
    await runAutomationsForEvent(
      { id: "e1", type: "invoice.paid", payload: { contactId: "c1", invoiceId: "i1", number: "CC-1", total: 1 } },
      [auto({ trigger: "INVOICE_PAID", actions: [{ type: "move_stage", value: "ACTIVE_CLIENT" }] })],
      w.ports,
    );
    expect(w.deals.map((d) => d.stage)).toEqual(["ACTIVE_CLIENT", "LOST"]);
  });

  it("create_task fills variables", async () => {
    const w = makeWorld();
    await runAutomationsForEvent(
      { id: "e1", type: "invoice.overdue", payload: { contactId: "c1", invoiceId: "i1", number: "CC-003", total: 900000 } },
      [auto({ trigger: "INVOICE_OVERDUE", actions: [{ type: "create_task", value: "Hacer seguimiento al pago de {factura}" }] })],
      w.ports,
    );
    expect(w.tasks).toEqual([{ contactId: "c1", text: "Hacer seguimiento al pago de CC-003" }]);
  });

  it("runs every matching automation, and none for a deleted contact", async () => {
    const w = makeWorld();
    const list = [
      auto({ id: "a1", trigger: "CONTACT_CREATED", actions: [{ type: "create_task", value: "A" }] }),
      auto({ id: "a2", trigger: "CONTACT_CREATED", actions: [{ type: "create_task", value: "B" }] }),
      auto({ id: "a3", trigger: "CONTACT_CREATED", active: false, actions: [{ type: "create_task", value: "C" }] }),
    ];
    const out = await runAutomationsForEvent({ id: "e1", type: "contact.created", payload: { contactId: "c1" } }, list, w.ports);
    expect(out.ran.map((r) => r.automationId)).toEqual(["a1", "a2"]);
    const none = await runAutomationsForEvent({ id: "e2", type: "contact.created", payload: { contactId: "nope" } }, list, w.ports);
    expect(none.ran).toEqual([]);
  });
});

// ---------- no infinite chains ----------

describe("no loops", () => {
  it("an automation that moves a deal does not re-trigger stage-change automations", async () => {
    const w = makeWorld();
    const automations = [
      // On any stage change → move to NEGOTIATION. If actions emitted events this would loop forever.
      auto({ id: "loop", trigger: "DEAL_STAGE_CHANGED", actions: [{ type: "move_stage", value: "NEGOTIATION" }, { type: "create_task", value: "t" }] }),
    ];
    w.userMovesDeal("d1", "PROPOSAL_SENT");
    await w.processAll(automations);
    expect(w.runs).toHaveLength(1);
    expect(w.tasks).toHaveLength(1);
    expect(w.deals[0].stage).toBe("NEGOTIATION");
    expect(w.queue).toHaveLength(0);
  });

  it("two automations that would ping-pong run once each per user action", async () => {
    const w = makeWorld();
    const automations = [
      auto({ id: "a", trigger: "DEAL_STAGE_CHANGED", condition: "PROPOSAL_SENT", actions: [{ type: "move_stage", value: "NEGOTIATION" }] }),
      auto({ id: "b", trigger: "DEAL_STAGE_CHANGED", condition: "NEGOTIATION", actions: [{ type: "move_stage", value: "PROPOSAL_SENT" }] }),
    ];
    w.userMovesDeal("d1", "PROPOSAL_SENT");
    await w.processAll(automations);
    expect(w.runs.map((r) => r.automationId)).toEqual(["a"]);
  });
});

// ---------- validation ----------

describe("automation input", () => {
  it("accepts the prototype automations", () => {
    const r = automationInputSchema.parse({
      name: "Respuesta automática a “precio”",
      trigger: "MESSAGE_RECEIVED",
      condition: "precio",
      actions: [
        { type: "send_whatsapp", value: "Hola {nombre}" },
        { type: "add_tag", value: "interesado" },
      ],
    });
    expect(r.actions).toHaveLength(2);
  });
  it("rejects bad stage conditions, empty actions and conditions on triggers without them", () => {
    expect(automationInputSchema.safeParse({ name: "x", trigger: "DEAL_STAGE_CHANGED", condition: "Negociación", actions: [{ type: "create_task", value: "t" }] }).success).toBe(false);
    expect(automationInputSchema.safeParse({ name: "x", trigger: "CONTACT_CREATED", actions: [] }).error?.issues[0]?.message).toBe("Agrega al menos una acción");
    expect(automationInputSchema.safeParse({ name: "x", trigger: "INVOICE_PAID", condition: "algo", actions: [{ type: "create_task", value: "t" }] }).success).toBe(false);
    expect(automationInputSchema.safeParse({ name: "x", trigger: "CONTACT_CREATED", actions: [{ type: "move_stage", value: "Ganado" }] }).success).toBe(false);
  });
  it("parseActions drops invalid stored actions", () => {
    expect(parseActions([{ type: "add_tag", value: "vip" }, { type: "explode", value: 1 }, null])).toEqual([{ type: "add_tag", value: "vip" }]);
    expect(parseActions("nope")).toEqual([]);
  });
});
