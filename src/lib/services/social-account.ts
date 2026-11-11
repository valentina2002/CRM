import "server-only";
import type { Channel } from "@/generated/prisma/enums";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import * as page from "@/lib/meta/page-graph";
import type { SocialChannel } from "@/lib/meta/messaging-parser";
import { DomainError, logActivity } from "./core";

export const SOCIAL_CHANNELS: readonly SocialChannel[] = ["FACEBOOK", "INSTAGRAM"];
export const isSocialChannel = (c: Channel | string | null | undefined): c is SocialChannel => c === "FACEBOOK" || c === "INSTAGRAM";

/** Public view of the Facebook Page / Instagram connection (never includes the token). */
export async function getSocialAccounts() {
  const rows = await db.channelAccount.findMany({ where: { channel: { in: [...SOCIAL_CHANNELS] } } });
  const fb = rows.find((r) => r.channel === "FACEBOOK");
  const ig = rows.find((r) => r.channel === "INSTAGRAM");
  return {
    facebook: fb ? { pageId: fb.externalId, name: fb.displayName, connectedAt: fb.connectedAt } : null,
    instagram: ig ? { igId: ig.externalId, username: ig.displayName, connectedAt: ig.connectedAt } : null,
  };
}

/** Page token + ids to send on a channel, or null when that channel is not connected. */
export async function getSocialCredentials(channel: SocialChannel) {
  const a = await db.channelAccount.findUnique({ where: { channel } });
  if (!a) return null;
  // Instagram messages are sent through the Page it is linked to (senderId = page id).
  return { token: decryptSecret(a.tokenEncrypted), pageId: channel === "INSTAGRAM" ? (a.senderId ?? a.externalId) : a.externalId, accountId: a.externalId };
}

/**
 * Connects a Facebook Page with its Page access token: validates it against Meta, subscribes the app to the
 * Page's messaging webhooks and stores the token encrypted. If the Page has an Instagram professional account
 * linked, Instagram is connected too (same token).
 */
export async function connectFacebookPage(input: { pageId: string; token: string }) {
  const info = await page.getPage(input.token, input.pageId).catch((e: unknown) => {
    throw new DomainError(`Meta rechazó los datos: ${e instanceof Error ? e.message : "error"}`);
  });
  await page.subscribePage(input.token, input.pageId).catch((e: unknown) => {
    throw new DomainError(`No se pudo suscribir la app a la página: ${e instanceof Error ? e.message : "error"}`);
  });
  let tokenEncrypted: string;
  try {
    tokenEncrypted = encryptSecret(input.token);
  } catch {
    throw new DomainError("Falta ENCRYPTION_KEY en el servidor: se necesita para guardar el token cifrado.");
  }
  const ig = info.instagram_business_account ?? null;
  const pageName = info.name ?? `Página ${input.pageId}`;
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.channelAccount.upsert({
      where: { channel: "FACEBOOK" },
      update: { externalId: input.pageId, senderId: input.pageId, displayName: pageName, tokenEncrypted, connectedAt: now, disconnectedAt: null },
      create: { channel: "FACEBOOK", externalId: input.pageId, senderId: input.pageId, displayName: pageName, tokenEncrypted },
    });
    if (ig) {
      const handle = ig.username ? `@${ig.username}` : `Instagram ${ig.id}`;
      await tx.channelAccount.upsert({
        where: { channel: "INSTAGRAM" },
        update: { externalId: ig.id, senderId: input.pageId, displayName: handle, tokenEncrypted, connectedAt: now, disconnectedAt: null },
        create: { channel: "INSTAGRAM", externalId: ig.id, senderId: input.pageId, displayName: handle, tokenEncrypted },
      });
    } else {
      await tx.channelAccount.deleteMany({ where: { channel: "INSTAGRAM" } });
    }
    await logActivity(tx, {
      type: "channel.connected",
      text: ig ? `Facebook (${pageName}) e Instagram (${ig.username ? `@${ig.username}` : ig.id}) conectados` : `Facebook conectado: ${pageName}`,
    });
  });
  return { pageName, instagram: ig?.username ? `@${ig.username}` : ig ? ig.id : null };
}

/** Removes the stored tokens. The Page and the Instagram account keep working in their own apps. */
export async function disconnectSocial() {
  const creds = await getSocialCredentials("FACEBOOK").catch(() => null);
  if (creds) await page.unsubscribePage(creds.token, creds.pageId).catch(() => {}); // best effort
  await db.$transaction(async (tx) => {
    const { count } = await tx.channelAccount.deleteMany({ where: { channel: { in: [...SOCIAL_CHANNELS] } } });
    if (count) await logActivity(tx, { type: "channel.disconnected", text: "Facebook e Instagram desconectados del CRM" });
  });
}
