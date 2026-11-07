import { describe, expect, it } from "vitest";
import { computeDashboard, invoiceTotal } from "./dashboard";
import { contactInputSchema, dealInputSchema, normalizeTags, taskInputSchema } from "./validation";

describe("normalizeTags", () => {
  it("splits, trims and dedupes case-insensitively", () => {
    expect(normalizeTags(" cliente, VIP ,, Cliente,retainer ")).toEqual(["cliente", "VIP", "retainer"]);
    expect(normalizeTags(["lead", "  lead  ", "Web"])).toEqual(["lead", "Web"]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe("contactInputSchema", () => {
  it("normalizes a full contact", () => {
    const r = contactInputSchema.parse({
      name: "  Mariana López ",
      company: "Spa Bienestar",
      phone: "300 555 0199",
      email: "Mariana@Ejemplo.co",
      service: "SEO local",
      monthlyValue: "1.200.000",
      tags: "lead, web",
    });
    expect(r).toEqual({
      name: "Mariana López",
      company: "Spa Bienestar",
      phone: "+573005550199",
      email: "mariana@ejemplo.co",
      service: "SEO local",
      monthlyValue: 1200000,
      tags: ["lead", "web"],
    });
  });

  it("turns empty optional fields into null", () => {
    const r = contactInputSchema.parse({ name: "Ana", company: "", phone: "", email: "", monthlyValue: "" });
    expect(r).toMatchObject({ company: null, phone: null, email: null, service: null, monthlyValue: 0, tags: [] });
  });

  it("rejects missing name, bad phone and bad email with Spanish messages", () => {
    const noName = contactInputSchema.safeParse({ name: " ", monthlyValue: 0 });
    expect(noName.error?.issues[0]?.message).toBe("El nombre es obligatorio");
    const badPhone = contactInputSchema.safeParse({ name: "Ana", phone: "123", monthlyValue: 0 });
    expect(badPhone.error?.issues[0]?.message).toBe("Número de WhatsApp no válido");
    const badEmail = contactInputSchema.safeParse({ name: "Ana", email: "ana@", monthlyValue: 0 });
    expect(badEmail.error?.issues[0]?.message).toBe("Correo no válido");
  });

  it("rejects services that are not in the list", () => {
    expect(contactInputSchema.safeParse({ name: "Ana", service: "Diseño web", monthlyValue: 0 }).success).toBe(false);
  });
});

describe("deal and task schemas", () => {
  it("validates stage values", () => {
    expect(dealInputSchema.safeParse({ contactId: "c1", title: "Plan", value: "900000", stage: "NEGOTIATION" }).success).toBe(true);
    expect(dealInputSchema.safeParse({ contactId: "c1", title: "Plan", value: 0, stage: "Negociación" }).success).toBe(false);
  });
  it("accepts optional due date", () => {
    expect(taskInputSchema.parse({ text: "Llamar", dueAt: "" })).toEqual({ text: "Llamar", contactId: null, dueAt: null });
    expect(taskInputSchema.parse({ text: "Llamar", dueAt: "2026-11-10", contactId: "c1" }).dueAt).toBe("2026-11-10");
  });
});

describe("dashboard", () => {
  const now = new Date("2026-11-06T20:00:00Z");
  const items = (n: number) => [{ quantity: 1, unitPrice: n }];

  it("computes invoice totals", () => {
    expect(invoiceTotal({ items: [{ quantity: 4, unitPrice: 450000 }, { quantity: 1, unitPrice: 100 }] })).toBe(1800100);
  });

  it("computes KPIs like the prototype, with 'cobrado' limited to the current month", () => {
    const d = computeDashboard({
      now,
      contactCount: 6,
      unread: 3,
      deals: [
        { stage: "ACTIVE_CLIENT", value: 2400000 },
        { stage: "PROSPECT", value: 1200000 },
        { stage: "ACTIVE_CLIENT", value: 900000 },
        { stage: "PROPOSAL_SENT", value: 1800000 },
        { stage: "PROSPECT", value: 1500000 },
        { stage: "NEGOTIATION", value: 2000000 },
      ],
      invoices: [
        { status: "PAID", paidAt: new Date("2026-11-02T15:00:00Z"), items: items(2400000) },
        { status: "PAID", paidAt: new Date("2026-10-15T15:00:00Z"), items: items(999) }, // last month
        { status: "SENT", paidAt: null, items: items(2400000) },
        { status: "OVERDUE", paidAt: null, items: items(900000) },
        { status: "DRAFT", paidAt: null, items: items(1800000) },
      ],
    });
    expect(d.activeClients).toBe(2);
    expect(d.pipelineOpen).toBe(6500000);
    expect(d.pipelineOpenCount).toBe(4);
    expect(d.collectedThisMonth).toBe(2400000);
    expect(d.receivable).toBe(3300000);
    expect(d.overdueCount).toBe(1);
    expect(d.byStage.find((b) => b.stage === "ACTIVE_CLIENT")).toMatchObject({ count: 2, value: 3300000 });
    expect(d.maxStageValue).toBe(3300000);
  });

  it("uses Bogotá month boundaries", () => {
    // 1 nov 03:00 UTC is still 31 oct in Bogotá → not this month.
    const d = computeDashboard({
      now,
      contactCount: 0,
      unread: 0,
      deals: [],
      invoices: [{ status: "PAID", paidAt: new Date("2026-11-01T03:00:00Z"), items: items(5) }],
    });
    expect(d.collectedThisMonth).toBe(0);
    expect(d.maxStageValue).toBe(1);
  });
});
