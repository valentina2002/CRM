import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hmacSha256Header, verifyMetaSignature } from "@/lib/crypto";
import { parseWebhook, type ParsedItem } from "@/lib/whatsapp/webhook-parser";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", "whatsapp", `${name}.json`), "utf8");
const parse = (name: string) => parseWebhook(JSON.parse(fixture(name)));
const only = <K extends ParsedItem["kind"]>(items: ParsedItem[], kind: K) => items.filter((i): i is Extract<ParsedItem, { kind: K }> => i.kind === kind);

describe("X-Hub-Signature-256", () => {
  const body = fixture("messages-text");
  const secret = "app-secret-de-prueba";

  it("accepts the signature of the raw body", () => {
    expect(verifyMetaSignature(body, hmacSha256Header(body, secret), secret)).toBe(true);
  });
  it("rejects a tampered body, wrong secret, missing header or missing secret", () => {
    const header = hmacSha256Header(body, secret);
    expect(verifyMetaSignature(body.replace("PRECIO", "precio"), header, secret)).toBe(false);
    expect(verifyMetaSignature(body, header, "otro")).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, header, undefined)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", secret)).toBe(false);
  });
});

describe("token encryption (AES-256-GCM)", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("round-trips and never stores the plain token", () => {
    const enc = encryptSecret("EAAG-token-secreto", key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("EAAG");
    expect(decryptSecret(enc, key)).toBe("EAAG-token-secreto");
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key)); // random IV
  });
  it("fails with a wrong key or tampered data", () => {
    const enc = encryptSecret("secreto", key);
    expect(() => decryptSecret(enc, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    const parts = enc.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
    expect(() => encryptSecret("x", "corta")).toThrow("32 bytes");
  });
});

describe("parseWebhook", () => {
  it("messages: inbound text with contact name, phone and BSUID; media gets a placeholder", () => {
    const inbound = only(parse("messages-text"), "inbound");
    expect(inbound).toHaveLength(2);
    expect(inbound[0]).toMatchObject({
      wamid: "wamid.IN_TEXT_1",
      phoneNumberId: "106540352242922",
      body: "Hola, ¿qué PRECIO tiene el SEO local?",
      peer: { waId: "573005550102", userId: "CO.13491208655302741918", name: "Carlos Restrepo" },
    });
    expect(inbound[0].at.toISOString()).toBe(new Date(1762470000 * 1000).toISOString());
    expect(inbound[1].body).toBe("📷 Imagen: mi ficha de Google");
  });

  it("statuses: sent / delivered / read / failed with error", () => {
    const st = only(parse("statuses"), "status");
    expect(st.map((s) => s.status)).toEqual(["sent", "delivered", "read", "failed"]);
    expect(st[3].error).toContain("131047");
    expect(st[0].error).toBeNull();
  });

  it("smb_message_echoes: messages sent from the phone app, including edits", () => {
    const echoes = only(parse("smb_message_echoes"), "echo");
    expect(echoes[0]).toMatchObject({ wamid: "wamid.ECHO_1", body: "Te respondo desde el celular 📱", peer: { waId: "573005550102" }, editOf: null });
    expect(echoes[1]).toMatchObject({ type: "edit", editOf: "wamid.ECHO_1", body: "editado" });
  });

  it("history: messages per thread, who sent them, status, progress", () => {
    const items = parse("history");
    const msgs = only(items, "history_message");
    expect(msgs.map((m) => [m.wamid, m.fromBusiness, m.status])).toEqual([
      ["wamid.H_1", false, "read"],
      ["wamid.H_2", true, "delivered"],
      ["wamid.H_3", false, null],
    ]);
    expect(msgs[2].body).toBe("📎 Archivo (se descarga aparte)");
    expect(msgs[0].peer).toEqual({ waId: "573105550103", userId: "CO.555", name: null });
    expect(only(items, "history_progress")).toEqual([{ kind: "history_progress", phase: 0, chunk: 1, progress: 55 }]);
  });

  it("history declined by the business (bare payload, error 2593109)", () => {
    const errors = only(parse("history-declined"), "history_error");
    expect(errors).toEqual([{ kind: "history_error", code: 2593109, message: "History sync is turned off by the business from the WhatsApp Business App" }]);
  });

  it("smb_app_state_sync: contacts added and removed", () => {
    const sync = only(parse("smb_app_state_sync"), "contact_sync");
    expect(sync).toEqual([
      { kind: "contact_sync", action: "add", peer: { waId: "573205550177", userId: "CO.777", name: "Pablo Morales" } },
      { kind: "contact_sync", action: "remove", peer: { waId: "573205550188", userId: "CO.888", name: null } },
    ]);
  });

  it("ignores unknown fields and garbage without throwing", () => {
    expect(parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual([
      { kind: "ignored", field: "account_update" },
    ]);
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: "x" })).toEqual([]);
    expect(parseWebhook({ entry: [{ changes: [{ field: "messages", value: { messages: [{ nope: true }] } }] }] })).toEqual([]);
  });
});
