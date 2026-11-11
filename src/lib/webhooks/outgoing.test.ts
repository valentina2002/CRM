import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWebhookBody, deliveryStatus, MAX_ATTEMPTS, nextRetryAt, validateWebhookUrl, webhookHeaders } from "./outgoing";

describe("retries", () => {
  it("waits 1 min, 5 min, 30 min, 2 h and 12 h, then gives up", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const minutes = [1, 2, 3, 4, 5].map((attempt) => (nextRetryAt(attempt, now)!.getTime() - now.getTime()) / 60_000);
    expect(minutes).toEqual([1, 5, 30, 120, 720]);
    expect(nextRetryAt(6, now)).toBeNull();
    expect(MAX_ATTEMPTS).toBe(6);
  });
});

describe("payload and signature", () => {
  it("has id, type, Bogotá createdAt and data", () => {
    const body = buildWebhookBody({ id: "abc", type: "invoice.paid", createdAt: new Date("2026-11-07T01:00:00Z") }, { total: 1 });
    expect(JSON.parse(body)).toEqual({ id: "evt_abc", type: "invoice.paid", createdAt: "2026-11-06T20:00:00-05:00", data: { total: 1 } });
  });

  it("signs the exact body with the endpoint secret", () => {
    const body = '{"a":1}';
    const headers = webhookHeaders("contact.created", body, "whsec_x", "d1");
    expect(headers["X-CRM-Event"]).toBe("contact.created");
    expect(headers["X-CRM-Delivery"]).toBe("d1");
    expect(headers["X-CRM-Signature"]).toBe(`sha256=${createHmac("sha256", "whsec_x").update(body).digest("hex")}`);
  });
});

describe("destination URL", () => {
  it("requires public https in production", () => {
    expect(validateWebhookUrl("https://hooks.zapier.com/hooks/catch/1")).toEqual({ ok: true, url: "https://hooks.zapier.com/hooks/catch/1" });
    for (const bad of ["http://ejemplo.com", "https://localhost/x", "https://127.0.0.1", "https://10.0.0.5", "https://192.168.1.2", "https://169.254.169.254/latest", "https://[::1]/", "https://u:p@ejemplo.com", "ftp://x.com", "no es url"]) {
      expect(validateWebhookUrl(bad).ok, bad).toBe(false);
    }
  });
  it("allows http and localhost only in development", () => {
    expect(validateWebhookUrl("http://localhost:4545/hook", { allowLocal: true }).ok).toBe(true);
    expect(validateWebhookUrl("ftp://localhost", { allowLocal: true }).ok).toBe(false);
  });
});

describe("delivery status label", () => {
  const base = { ok: false, attempt: 1, statusCode: null, nextTryAt: null, lastAttemptAt: null };
  const t = new Date();
  it("covers queued, delivered, retrying and failed", () => {
    expect(deliveryStatus({ ...base, nextTryAt: t }).tone).toBe("pending");
    expect(deliveryStatus({ ...base, ok: true, attempt: 3, lastAttemptAt: t }).label).toBe("Entregado al intento 3");
    expect(deliveryStatus({ ...base, attempt: 2, statusCode: 500, nextTryAt: t, lastAttemptAt: t }).label).toBe("Falló (500) · reintento 1 de 5");
    expect(deliveryStatus({ ...base, attempt: 6, statusCode: 503, lastAttemptAt: t }).label).toBe("Falló (503) tras 6 intentos");
  });
});
