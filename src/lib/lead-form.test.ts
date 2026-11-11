import { describe, expect, it } from "vitest";
import { clientIp, embedSnippet, extractUtm, hashIp, isBot, leadSubmissionSchema, originSummary, safeHttpUrl } from "./lead-form";

describe("lead submission", () => {
  it("accepts a lead with WhatsApp and normalizes it", () => {
    const r = leadSubmissionSchema.parse({ name: " Mariana ", phone: "300 555 0199", consent: "on", email: "" });
    expect(r).toMatchObject({ name: "Mariana", phone: "+573005550199", email: null, company: null });
  });
  it("accepts email only", () => {
    expect(leadSubmissionSchema.safeParse({ name: "Ana", email: "Ana@Ejemplo.co", consent: "on" }).data?.email).toBe("ana@ejemplo.co");
  });
  it("needs a phone or email, a valid phone and the data consent", () => {
    const issues = (raw: object) => leadSubmissionSchema.safeParse(raw).error?.issues.map((i) => i.message) ?? [];
    expect(issues({ name: "Ana", consent: "on" })).toContain("Déjanos tu WhatsApp o tu correo para contactarte");
    expect(issues({ name: "Ana", phone: "123", consent: "on" })).toContain("Escribe un número de WhatsApp válido");
    expect(issues({ name: "Ana", phone: "3005550199" })).toContain("Debes autorizar el tratamiento de tus datos");
    expect(issues({ phone: "3005550199", consent: "on" })).toContain("Escribe tu nombre");
  });
  it("detects the honeypot", () => {
    expect(isBot({ website: "http://spam" })).toBe(true);
    expect(isBot({ website: "" })).toBe(false);
    expect(isBot({})).toBe(false);
  });
});

describe("origin", () => {
  it("takes UTMs from fields first, then from the page URL", () => {
    expect(extractUtm({ utm_source: "instagram" }, "https://valentina.co/?utm_source=google&utm_campaign=seo-local")).toEqual({ utm_source: "instagram", utm_campaign: "seo-local" });
    expect(extractUtm({}, "no es url")).toEqual({});
  });
  it("summarizes the origin for the contact note", () => {
    expect(originSummary("Contacto web", "https://valentina.co/servicios", { utm_source: "google", utm_medium: "cpc" })).toBe(
      "Formulario: Contacto web · Página: https://valentina.co/servicios · Campaña: source=google, medium=cpc",
    );
  });
  it("only keeps http(s) URLs", () => {
    expect(safeHttpUrl("https://valentina.co/gracias")).toBe("https://valentina.co/gracias");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
  });
});

describe("privacy and embedding", () => {
  it("never keeps the raw IP", () => {
    const h = hashIp("181.50.1.2", "sal");
    expect(h).toHaveLength(32);
    expect(h).not.toContain("181");
    expect(hashIp("181.50.1.2", "otra")).not.toBe(h);
  });
  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "181.50.1.2, 10.0.0.1" }))).toBe("181.50.1.2");
    expect(clientIp(new Headers())).toBe("desconocida");
  });
  it("the embed snippet posts to the form URL and includes honeypot and consent", () => {
    const html = embedSnippet("https://crm.example/api/forms/abc", "Autorizo…");
    expect(html).toContain('action="https://crm.example/api/forms/abc"');
    expect(html).toContain('name="website"');
    expect(html).toContain('name="consent" required');
  });
});
