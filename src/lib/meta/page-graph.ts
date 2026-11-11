import "server-only";
import { graph, GraphError } from "@/lib/whatsapp/graph";
import type { SocialChannel } from "./messaging-parser";

// Messenger Platform + Instagram messaging through a Facebook Page (Facebook Login path): one Page access token
// sends and receives for the Page and for the Instagram professional account linked to it.
// See docs/06-facebook-instagram.md for what is verified against Meta's docs and what still needs a real test.

/** Page webhook fields the CRM needs (Instagram fields are subscribed in the app dashboard). */
export const PAGE_WEBHOOK_FIELDS = ["messages", "messaging_postbacks", "message_deliveries", "message_reads", "message_echoes"] as const;

export type PageInfo = { id: string; name?: string; instagram_business_account?: { id: string; username?: string } };

/** Validates the token against the Page and returns its name and linked Instagram account (if any). */
export async function getPage(token: string, pageId: string) {
  return graph<PageInfo>(pageId, { token, query: { fields: "name,instagram_business_account{id,username}" } });
}

export async function subscribePage(token: string, pageId: string) {
  await graph(`${pageId}/subscribed_apps`, { token, method: "POST", query: { subscribed_fields: PAGE_WEBHOOK_FIELDS.join(",") } });
}

export async function unsubscribePage(token: string, pageId: string) {
  await graph(`${pageId}/subscribed_apps`, { token, method: "DELETE" });
}

/** Free-form reply inside the 24 h window. `recipientId` is the PSID (Messenger) or IGSID (Instagram). */
export async function sendSocialText(token: string, pageId: string, recipientId: string, text: string) {
  const r = await graph<{ message_id?: string; recipient_id?: string }>(`${pageId}/messages`, {
    token,
    method: "POST",
    json: { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } },
  });
  if (!r.message_id) throw new GraphError("Meta no devolvió el id del mensaje", 502, null);
  return r.message_id;
}

/** Public profile of the person who wrote (best effort: needs the user's consent / app permissions). */
export async function getSocialProfile(token: string, channel: SocialChannel, userId: string): Promise<{ name: string | null; handle: string | null }> {
  if (channel === "INSTAGRAM") {
    const p = await graph<{ name?: string; username?: string }>(userId, { token, query: { fields: "name,username" } });
    return { name: p.name?.trim() || (p.username ? `@${p.username}` : null), handle: p.username ? `@${p.username}` : null };
  }
  const p = await graph<{ first_name?: string; last_name?: string }>(userId, { token, query: { fields: "first_name,last_name" } });
  return { name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null, handle: null };
}
