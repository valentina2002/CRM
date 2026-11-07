import { after } from "next/server";
import { safeEqual, verifyMetaSignature } from "@/lib/crypto";
import { db } from "@/lib/db";
import { runBackgroundWork } from "@/lib/services/pipeline";

/** Meta verification: GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && expected && safeEqual(params.get("hub.verify_token") ?? "", expected)) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Webhook events: verify X-Hub-Signature-256 on the RAW body, store the payload, answer 200 right away
 * and process it after the response (idempotent by wamid).
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  await db.webhookInbox.create({ data: { source: "meta", payload: payload as object } });
  after(async () => {
    try {
      await runBackgroundWork();
    } catch (error) {
      console.error("Error procesando webhooks de WhatsApp", error);
    }
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
