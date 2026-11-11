import { describe, expect, it } from "vitest";
import { computeReport, formatDuration, lastMonths, median, monthLabel, periodKey, responseTimesMinutes, type ReportInput } from "./reports";

const NOW = new Date("2026-11-11T15:00:00Z");
const d = (iso: string) => new Date(iso);
const inv = (status: "SENT" | "PAID" | "OVERDUE" | "DRAFT", due: string, total: number, extra: Partial<ReportInput["invoices"][number]> = {}) => ({
  status,
  dueDate: d(`${due}T00:00:00Z`),
  paidAt: null,
  contact: { id: "c1", name: "Andrea", service: "SEO local" },
  items: [{ quantity: 1, unitPrice: total }],
  ...extra,
});

describe("helpers", () => {
  it("median and durations", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0.2)).toBe("1 min");
    expect(formatDuration(200)).toBe("3 h 20 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(3 * 1440)).toBe("3 días");
  });
  it("last months in Bogotá and their labels", () => {
    expect(lastMonths(3, NOW)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(lastMonths(2, d("2026-01-01T03:00:00Z"))).toEqual(["2025-11", "2025-12"]); // still Dec 31 in Bogotá
    expect(monthLabel("2026-11")).toBe("nov 26");
  });
  it("period defaults to 90 days", () => {
    expect(periodKey("30")).toBe("30");
    expect(periodKey("x")).toBe("90");
  });
});

describe("response time", () => {
  it("measures from the first unanswered message to the next human reply", () => {
    const m = (direction: "IN" | "OUT", at: string, via: string | null = null) => ({ conversationId: "k", direction, via, sentAt: d(at) });
    expect(
      responseTimesMinutes([
        m("IN", "2026-11-10T14:00:00Z"),
        m("IN", "2026-11-10T14:10:00Z"),
        m("OUT", "2026-11-10T14:05:00Z", "AUTOMATION"),
        m("OUT", "2026-11-10T14:30:00Z", "CRM"),
        m("IN", "2026-11-10T15:00:00Z"),
        m("OUT", "2026-11-10T17:00:00Z", "APP"),
        m("IN", "2026-11-10T18:00:00Z", "HISTORY"),
      ]),
    ).toEqual([30, 120]);
  });
});

describe("report", () => {
  const base: ReportInput = { now: NOW, contacts: [], deals: [], invoices: [], messages: [], periodDays: 90 };

  it("origin of contacts and conversion to clients", () => {
    const r = computeReport({
      ...base,
      contacts: [
        { id: "1", source: "form", service: null, createdAt: NOW, stages: ["ACTIVE_CLIENT"] },
        { id: "2", source: "form", service: null, createdAt: NOW, stages: ["PROSPECT"] },
        { id: "3", source: "instagram", service: null, createdAt: NOW, stages: [] },
        { id: "4", source: null, service: null, createdAt: NOW, stages: [] },
      ],
    });
    expect(r.sources).toEqual([
      { label: "Formulario web", contacts: 2, clients: 1 },
      { label: "Instagram", contacts: 1, clients: 0 },
      { label: "Otro", contacts: 1, clients: 0 },
    ]);
    expect([r.newContacts, r.newClients]).toEqual([4, 1]);
  });

  it("closing rate counts deals won or lost in the period", () => {
    const r = computeReport({
      ...base,
      deals: [
        { stage: "ACTIVE_CLIENT", updatedAt: d("2026-11-01T00:00:00Z") },
        { stage: "LOST", updatedAt: d("2026-10-01T00:00:00Z") },
        { stage: "LOST", updatedAt: d("2026-10-02T00:00:00Z") },
        { stage: "ACTIVE_CLIENT", updatedAt: d("2025-01-01T00:00:00Z") },
        { stage: "PROSPECT", updatedAt: NOW },
      ],
    });
    expect(r.closeRate).toBeCloseTo(1 / 3);
    expect([r.won, r.decided]).toEqual([1, 3]);
    expect(computeReport(base).closeRate).toBeNull();
  });

  it("collected per month, per service and top clients", () => {
    const r = computeReport({
      ...base,
      invoices: [
        inv("PAID", "2026-11-05", 1000, { paidAt: d("2026-11-03T00:00:00Z") }),
        inv("PAID", "2026-10-05", 500, { paidAt: d("2026-10-10T00:00:00Z"), contact: { id: "c2", name: "Carlos", service: null } }),
        inv("PAID", "2025-01-05", 900, { paidAt: d("2025-01-10T00:00:00Z") }),
        inv("SENT", "2026-12-01", 777),
      ],
    });
    expect(r.collectedByMonth.map((m) => m.total)).toEqual([0, 0, 0, 0, 500, 1000]);
    expect(r.collectedInPeriod).toBe(1500);
    expect(r.byService).toEqual([
      { label: "SEO local", total: 1000 },
      { label: "Sin servicio", total: 500 },
    ]);
    expect(r.byClient[0]).toEqual({ label: "Andrea", total: 1000 });
  });

  it("receivables by age", () => {
    const r = computeReport({
      ...base,
      invoices: [inv("SENT", "2026-11-20", 100), inv("OVERDUE", "2026-11-01", 200), inv("OVERDUE", "2026-09-30", 300), inv("OVERDUE", "2026-06-01", 400), inv("PAID", "2026-01-01", 999)],
    });
    expect(Object.fromEntries(r.aging.map((b) => [b.key, b.total]))).toEqual({ current: 100, "1-30": 200, "31-60": 300, "61-90": 0, "90+": 400 });
    expect(r.receivable).toBe(1000);
  });
});
