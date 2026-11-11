import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, parseBearerKey } from "./keys";
import { DEFAULT_RATE_LIMIT, rateLimitHeaders, rateLimitPerMinute, rateState, rateWindowStart } from "./rate-limit";
import {
  parseContactCreate,
  parseContactPatch,
  parseContactQuery,
  parseDealCreate,
  parseDealPatch,
  parseInvoiceCreate,
  parseInvoicePay,
  parseInvoiceQuery,
  parseMessageCreate,
  parseStage,
  validationError,
} from "./schemas";
import { serializeContact, serializeInvoice } from "./serialize";

describe("API keys", () => {
  it("generates crm_ keys whose hash is stored and whose prefix identifies them", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^crm_[A-Za-z0-9_-]{32}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.key.slice(4));
  });

  it("reads only well-formed Bearer keys", () => {
    const { key } = generateApiKey();
    expect(parseBearerKey(`Bearer ${key}`)).toBe(key);
    expect(parseBearerKey(`bearer ${key}  `)).toBe(key);
    expect(parseBearerKey(key)).toBeNull();
    expect(parseBearerKey(`Basic ${key}`)).toBeNull();
    expect(parseBearerKey("Bearer crm_corta")).toBeNull();
    expect(parseBearerKey(`Bearer ${key} extra`)).toBeNull();
    expect(parseBearerKey(null)).toBeNull();
  });
});

describe("rate limit", () => {
  const now = new Date("2026-11-10T15:30:42.500Z");

  it("uses one-minute windows", () => {
    expect(rateWindowStart(now).toISOString()).toBe("2026-11-10T15:30:00.000Z");
  });

  it("allows up to the limit and then answers with Retry-After", () => {
    const ok = rateState(120, 120, now);
    expect(ok).toMatchObject({ limited: false, remaining: 0, resetSeconds: 18 });
    expect(rateLimitHeaders(ok)["Retry-After"]).toBeUndefined();
    const over = rateState(121, 120, now);
    expect(over.limited).toBe(true);
    expect(rateLimitHeaders(over)).toMatchObject({ "X-RateLimit-Limit": "120", "X-RateLimit-Remaining": "0", "Retry-After": "18" });
  });

  it("reads the limit from the environment, with a safe default", () => {
    expect(rateLimitPerMinute("30")).toBe(30);
    expect(rateLimitPerMinute(undefined)).toBe(DEFAULT_RATE_LIMIT);
    expect(rateLimitPerMinute("0")).toBe(DEFAULT_RATE_LIMIT);
    expect(rateLimitPerMinute("abc")).toBe(DEFAULT_RATE_LIMIT);
  });
});

describe("stages", () => {
  it("accepts the enum value or the Spanish label, ignoring case and accents", () => {
    expect(parseStage("NEGOTIATION")).toBe("NEGOTIATION");
    expect(parseStage("Negociación")).toBe("NEGOTIATION");
    expect(parseStage("cliente activo")).toBe("ACTIVE_CLIENT");
    expect(parseStage("Propuesta Enviada")).toBe("PROPOSAL_SENT");
    expect(parseStage("ganado")).toBeNull();
    expect(parseStage(3)).toBeNull();
  });
});

describe("contact schemas", () => {
  it("creates with the same rules as the form (E.164, tags, COP)", () => {
    const r = parseContactCreate({ name: "Mariana", phone: "300 555 0199", tags: ["lead", "Lead", "web"], monthlyValue: "1.200.000", email: null });
    expect(r.success && r.data).toMatchObject({ name: "Mariana", phone: "+573005550199", tags: ["lead", "web"], monthlyValue: 1200000, email: null });
  });

  it("reports every invalid field in Spanish", () => {
    const r = parseContactCreate({ email: "no", service: "Otro" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const body = validationError(r.error);
    expect(body.details.map((d) => d.field).sort()).toEqual(["email", "name", "service"]);
    expect(body.error).toMatch(/^\w+: /);
  });

  const current = { name: "Andrea", company: "Café", phone: "+573005550101", email: "a@b.co", service: "SEO local", tags: ["cliente"], monthlyValue: 900000 };

  it("PATCH only changes the fields that are sent; null clears optional ones", () => {
    const r = parseContactPatch(current, { tags: ["vip"], phone: null });
    expect(r.success && r.data).toEqual({ ...current, tags: ["vip"], phone: null });
  });

  it("PATCH without known fields is rejected", () => {
    expect(parseContactPatch(current, { foo: 1 }).success).toBe(false);
    expect(parseContactPatch(current, []).success).toBe(false);
  });

  it("query: empty values are ignored and a bad page falls back to 1", () => {
    const p = parseContactQuery(new URLSearchParams("q=&tag=vip&page=abc"));
    expect(p.success && p.data).toEqual({ q: undefined, tag: "vip", page: 1 });
  });
});

describe("deal schemas", () => {
  it("defaults to Prospecto and accepts labels", () => {
    expect(parseDealCreate({ contactId: "c1", title: "SEO" }).data).toEqual({ contactId: "c1", title: "SEO", value: 0, stage: "PROSPECT" });
    expect(parseDealPatch({ stage: "Perdido" }).data).toEqual({ stage: "LOST" });
  });
  it("rejects unknown stages and empty patches", () => {
    expect(parseDealPatch({ stage: "Ganado" }).success).toBe(false);
    expect(parseDealPatch({}).success).toBe(false);
    expect(parseDealPatch({ value: -1 }).success).toBe(false);
  });
});

describe("message schema", () => {
  it("takes contactId or a phone number", () => {
    expect(parseMessageCreate({ contactId: "c1", text: " hola " }).data).toEqual({ contactId: "c1", to: null, text: "hola" });
    expect(parseMessageCreate({ to: "+57 300 555 0102", text: "hola" }).data).toEqual({ contactId: null, to: "+573005550102", text: "hola" });
  });
  it("needs a destination and a text", () => {
    expect(parseMessageCreate({ text: "hola" }).success).toBe(false);
    expect(parseMessageCreate({ contactId: "", text: "hola" }).success).toBe(false);
    expect(parseMessageCreate({ to: "123", text: "hola" }).success).toBe(false);
    expect(parseMessageCreate({ contactId: "c1", text: "  " }).success).toBe(false);
  });
});

describe("invoice schemas", () => {
  const items = [{ description: "SEO local", quantity: 1, unitPrice: 1500000 }];

  it("defaults the due date to 15 days after the issue date", () => {
    const r = parseInvoiceCreate({ contactId: "c1", issueDate: "2026-11-20", items });
    expect(r.success && r.data).toMatchObject({ issueDate: "2026-11-20", dueDate: "2026-12-05" });
  });
  it("defaults the issue date to today", () => {
    const r = parseInvoiceCreate({ contactId: "c1", items });
    expect(r.success && r.data.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("rejects impossible dates and due dates before the issue date", () => {
    expect(parseInvoiceCreate({ contactId: "c1", issueDate: "2026-02-30", items }).success).toBe(false);
    expect(parseInvoiceCreate({ contactId: "c1", issueDate: "2026-11-10", dueDate: "2026-11-01", items }).success).toBe(false);
    expect(parseInvoiceCreate({ contactId: "c1", items: [] }).success).toBe(false);
  });
  it("pay: optional paidAt, today by default", () => {
    expect(parseInvoicePay({ paidAt: "2026-11-01" }).data).toEqual({ paidAt: "2026-11-01" });
    expect(parseInvoicePay(undefined).data?.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseInvoicePay({ paidAt: "ayer" }).success).toBe(false);
  });
  it("status filter only accepts the four statuses", () => {
    expect(parseInvoiceQuery(new URLSearchParams("status=PAID")).data).toEqual({ status: "PAID", contactId: undefined });
    expect(parseInvoiceQuery(new URLSearchParams("status=pagada")).success).toBe(false);
  });
});

describe("serializers", () => {
  it("contacts expose ISO dates and no internal fields", () => {
    const c = serializeContact({
      id: "c1",
      name: "A",
      company: null,
      phone: "+573005550101",
      email: null,
      service: null,
      tags: [],
      monthlyValue: 0,
      source: "api",
      createdAt: new Date("2026-11-06T20:00:00Z"),
      updatedAt: new Date("2026-11-06T21:00:00Z"),
    });
    expect(c.createdAt).toBe("2026-11-06T20:00:00.000Z");
  });

  it("invoices: calendar days, sorted lines and total", () => {
    const i = serializeInvoice({
      id: "i1",
      number: "CC-001",
      contactId: "c1",
      issueDate: new Date("2026-11-01T00:00:00Z"),
      dueDate: new Date("2026-11-16T00:00:00Z"),
      status: "PAID",
      sentAt: null,
      paidAt: new Date("2026-11-10T00:00:00Z"),
      notes: null,
      items: [
        { description: "b", quantity: 1, unitPrice: 500, position: 1 },
        { description: "a", quantity: 2, unitPrice: 1000, position: 0 },
      ],
    });
    expect(i).toMatchObject({ issueDate: "2026-11-01", dueDate: "2026-11-16", paidAt: "2026-11-10", total: 2500 });
    expect(i.items.map((x) => x.description)).toEqual(["a", "b"]);
  });
});
