import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSocialPayload, parseSocialWebhook, toDate, type SocialItem } from "@/lib/meta/messaging-parser";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", "meta", `${name}.json`), "utf8"));
const only = <K extends SocialItem["kind"]>(items: SocialItem[], kind: K) => items.filter((i): i is Extract<SocialItem, { kind: K }> => i.kind === kind);

describe("Messenger webhooks", () => {
  const items = parseSocialWebhook(fixture("messenger-text"));

  it("reads text, attachments and postbacks as inbound messages from the PSID", () => {
    const inbound = only(items, "inbound");
    expect(inbound.map((i) => [i.mid, i.type, i.body])).toEqual([
      ["m_FB_TEXT_1", "text", "Hola, ¿qué PRECIO tiene el SEO local?"],
      ["m_FB_IMG_1", "image", "📷 Imagen (+1)"],
      ["m_FB_POSTBACK_1", "postback", "Quiero una auditoría"],
    ]);
    expect(inbound[0]).toMatchObject({ channel: "FACEBOOK", peerId: "7100200300400501", accountId: "110200300400500" });
    expect(inbound[0].at.toISOString()).toBe("2025-11-06T23:00:00.000Z");
  });

  it("ignores reactions (they point to another message, not a new one)", () => {
    expect(only(items, "ignored").map((i) => i.reason)).toEqual(["reaction"]);
  });

  it("echoes keep the app id so the CRM can tell its own messages from the Page inbox", () => {
    const echoes = only(parseSocialWebhook(fixture("messenger-echo-delivery-read")), "echo");
    expect(echoes.map((e) => [e.mid, e.peerId, e.appId])).toEqual([
      ["m_FB_ECHO_INBOX", "7100200300400501", "263902037430900"],
      ["m_FB_ECHO_CRM", "7100200300400501", "1234567890"],
    ]);
  });

  it("delivery carries mids and watermark; read carries the watermark", () => {
    const all = parseSocialWebhook(fixture("messenger-echo-delivery-read"));
    expect(only(all, "delivered")[0]).toMatchObject({ mids: ["m_FB_ECHO_CRM"], peerId: "7100200300400501" });
    expect(only(all, "read")[0].watermark?.getTime()).toBe(1762470101500);
  });
});

describe("Instagram webhooks", () => {
  const items = parseSocialWebhook(fixture("instagram-messages"));

  it("reads DMs and story replies from the IGSID", () => {
    const inbound = only(items, "inbound");
    expect(inbound.map((i) => [i.channel, i.peerId, i.body])).toEqual([
      ["INSTAGRAM", "980010020030040", "Vi tu post sobre SEO para IA 👀 ¿haces auditorías?"],
      ["INSTAGRAM", "980010020030040", "↩️ Respondió a tu historia: ¡Me encantó!"],
      ["INSTAGRAM", "980010020030040", "Mensaje no soportado (míralo en la app)"],
    ]);
  });

  it("echoes from the Instagram app have no app id", () => {
    expect(only(items, "echo")).toEqual([
      expect.objectContaining({ mid: "aWdfECHO_APP", peerId: "980010020030040", accountId: "17841400000000001", appId: null }),
    ]);
  });

  it("seen events point to a message; deleted messages are reported", () => {
    expect(only(items, "read")[0]).toMatchObject({ mid: "aWdfECHO_APP", watermark: null });
    expect(only(items, "deleted")[0]).toMatchObject({ mid: "aWdfSTORYREPLY" });
  });
});

describe("routing helpers", () => {
  it("recognizes Messenger and Instagram payloads but not WhatsApp", () => {
    expect(isSocialPayload({ object: "page" })).toBe(true);
    expect(isSocialPayload({ object: "instagram" })).toBe(true);
    expect(isSocialPayload({ object: "whatsapp_business_account" })).toBe(false);
    expect(isSocialPayload(null)).toBe(false);
  });

  it("is lenient with malformed payloads", () => {
    expect(parseSocialWebhook({ object: "page", entry: [{ messaging: [{ nope: true }] }] })).toEqual([]);
    expect(parseSocialWebhook("x")).toEqual([]);
  });

  it("accepts millisecond and second timestamps", () => {
    expect(toDate(1762470000000).toISOString()).toBe(toDate(1762470000).toISOString());
  });
});
