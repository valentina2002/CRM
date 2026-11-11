import "server-only";
import { CHANNEL_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { parseSocialWebhook, type SocialChannel, type SocialItem } from "@/lib/meta/messaging-parser";
import { getSocialProfile } from "@/lib/meta/page-graph";
import { emit, logActivity, type Tx } from "./core";
import { getSocialCredentials } from "./social-account";

type Profile = { name: string | null; handle: string | null };
type Profiles = Map<string, Profile>;
const profileKey = (channel: SocialChannel, peerId: string) => `${channel}:${peerId}`;

const SOURCE: Record<SocialChannel, string> = { FACEBOOK: "facebook", INSTAGRAM: "instagram" };

/**
 * Finds the contact of a PSID / IGSID or creates it (with its "Prospecto" deal and conversation, like every
 * new contact). A person who already exists as a WhatsApp contact arrives here as a NEW contact: Meta gives
 * no phone number on these channels, so they are joined later with "Fusionar" in the contact sheet.
 */
async function resolveContact(tx: Tx, channel: SocialChannel, peerId: string, profiles: Profiles, emitCreated: boolean) {
  const identity = await tx.contactChannel.findUnique({ where: { channel_externalId: { channel, externalId: peerId } }, include: { contact: true } });
  const profile = profiles.get(profileKey(channel, peerId));
  if (identity) {
    if (profile?.handle && identity.handle !== profile.handle) await tx.contactChannel.update({ where: { id: identity.id }, data: { handle: profile.handle } });
    return identity.contact;
  }
  const label = CHANNEL_LABEL[channel];
  const contact = await tx.contact.create({
    data: { name: profile?.name || `Contacto de ${label}`, source: SOURCE[channel], tags: [SOURCE[channel]] },
  });
  await tx.contactChannel.create({ data: { contactId: contact.id, channel, externalId: peerId, handle: profile?.handle ?? null } });
  await tx.deal.create({ data: { contactId: contact.id, title: `Nueva oportunidad (${label})`, stage: "PROSPECT" } });
  await tx.conversation.create({ data: { contactId: contact.id, lastChannel: channel } });
  await logActivity(tx, { type: "contact.created", text: `Nuevo contacto desde ${label}: ${contact.name}`, contactId: contact.id });
  if (emitCreated) await emit(tx, "contact.created", { contactId: contact.id, source: SOURCE[channel] });
  return contact;
}

async function conversationFor(tx: Tx, contactId: string, channel: SocialChannel) {
  return tx.conversation.upsert({ where: { contactId }, update: {}, create: { contactId, lastChannel: channel } });
}

/** Conversation of a known PSID / IGSID (for delivery and read receipts). */
async function conversationOfPeer(tx: Tx, channel: SocialChannel, peerId: string) {
  const identity = await tx.contactChannel.findUnique({ where: { channel_externalId: { channel, externalId: peerId } } });
  return identity ? tx.conversation.findUnique({ where: { contactId: identity.contactId } }) : null;
}

const later = (current: Date | null, at: Date) => (!current || current < at ? at : undefined);

async function applyItem(tx: Tx, item: SocialItem, profiles: Profiles) {
  switch (item.kind) {
    case "inbound": {
      const { channel } = item;
      if (await tx.message.findUnique({ where: { channel_externalId: { channel, externalId: item.mid } } })) return; // idempotent
      const contact = await resolveContact(tx, channel, item.peerId, profiles, true);
      const conversation = await conversationFor(tx, contact.id, channel);
      await tx.message.create({
        data: { conversationId: conversation.id, channel, externalId: item.mid, direction: "IN", type: item.type, body: item.body, status: "RECEIVED", sentAt: item.at },
      });
      // lastInboundAt stays as the WhatsApp window; each social channel's window is derived from its own messages.
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { unread: { increment: 1 }, lastMessageAt: later(conversation.lastMessageAt, item.at), lastChannel: channel },
      });
      await logActivity(tx, { type: "message.received", text: `${CHANNEL_LABEL[channel]} entrante de ${contact.name}` });
      await emit(tx, "message.received", { contactId: contact.id, text: item.body, mid: item.mid, channel });
      return;
    }

    case "echo": {
      const { channel } = item;
      // Sent by this CRM through the API: the outbox already has (or is about to store) this message.
      if (item.appId && process.env.META_APP_ID && item.appId === process.env.META_APP_ID) return;
      if (await tx.message.findUnique({ where: { channel_externalId: { channel, externalId: item.mid } } })) return;
      const contact = await resolveContact(tx, channel, item.peerId, profiles, false);
      const conversation = await conversationFor(tx, contact.id, channel);
      // Without META_APP_ID we can't tell by app id: match a CRM message that is being sent right now.
      const inFlight = await tx.message.findFirst({
        where: { conversationId: conversation.id, channel, direction: "OUT", externalId: null, status: "SENT", body: item.body, sentAt: { gte: new Date(item.at.getTime() - 5 * 60_000) } },
        orderBy: { sentAt: "asc" },
      });
      if (inFlight) {
        await tx.message.update({ where: { id: inFlight.id }, data: { externalId: item.mid } });
        return;
      }
      await tx.message.create({
        data: { conversationId: conversation.id, channel, externalId: item.mid, direction: "OUT", via: "APP", type: item.type, body: item.body, status: "SENT", sentAt: item.at },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: later(conversation.lastMessageAt, item.at) } });
      await logActivity(tx, { type: "message.echo", text: `Respuesta desde ${channel === "FACEBOOK" ? "la bandeja de Facebook" : "la app de Instagram"} a ${contact.name}` });
      return;
    }

    case "deleted": {
      const message = await tx.message.findUnique({ where: { channel_externalId: { channel: item.channel, externalId: item.mid } } });
      if (message) {
        await tx.message.update({ where: { id: message.id }, data: { body: "🚫 Mensaje eliminado", meta: { ...(message.meta as object | null), revoked: true } } });
      }
      return;
    }

    case "delivered": {
      if (item.mids.length) {
        await tx.message.updateMany({ where: { channel: item.channel, externalId: { in: item.mids }, direction: "OUT", status: "SENT" }, data: { status: "DELIVERED" } });
        return;
      }
      const conversation = item.watermark ? await conversationOfPeer(tx, item.channel, item.peerId) : null;
      if (conversation && item.watermark) {
        await tx.message.updateMany({
          where: { conversationId: conversation.id, channel: item.channel, direction: "OUT", status: "SENT", externalId: { not: null }, sentAt: { lte: item.watermark } },
          data: { status: "DELIVERED" },
        });
      }
      return;
    }

    case "read": {
      // Everything sent up to the watermark (or up to the message that was seen) is read.
      const conversation = await conversationOfPeer(tx, item.channel, item.peerId);
      if (!conversation) return;
      let until = item.watermark;
      if (!until && item.mid) {
        const seen = await tx.message.findUnique({ where: { channel_externalId: { channel: item.channel, externalId: item.mid } } });
        until = seen?.sentAt ?? null;
      }
      if (!until) return;
      await tx.message.updateMany({
        where: { conversationId: conversation.id, channel: item.channel, direction: "OUT", status: { in: ["SENT", "DELIVERED"] }, externalId: { not: null }, sentAt: { lte: until } },
        data: { status: "READ" },
      });
      return;
    }

    default:
      return;
  }
}

/** Names / @usernames of people the CRM doesn't know yet. Network calls, so it runs before the transaction. */
async function fetchNewProfiles(items: SocialItem[]): Promise<Profiles> {
  const profiles: Profiles = new Map();
  const peers = new Map<string, { channel: SocialChannel; peerId: string }>();
  for (const item of items) {
    if (item.kind === "inbound" || item.kind === "echo") peers.set(profileKey(item.channel, item.peerId), { channel: item.channel, peerId: item.peerId });
  }
  for (const [key, { channel, peerId }] of peers) {
    const known = await db.contactChannel.findUnique({ where: { channel_externalId: { channel, externalId: peerId } }, select: { id: true } });
    if (known) continue;
    const creds = await getSocialCredentials(channel).catch(() => null);
    if (!creds) continue;
    const profile = await getSocialProfile(creds.token, channel, peerId).catch(() => null);
    if (profile) profiles.set(key, profile);
  }
  return profiles;
}

/** Applies one Messenger / Instagram webhook payload (idempotent by message id). */
export async function applySocialPayload(payload: unknown) {
  const items = parseSocialWebhook(payload);
  if (items.length === 0) return 0;
  const accounts = await db.channelAccount.findMany({ where: { channel: { in: ["FACEBOOK", "INSTAGRAM"] } }, select: { channel: true, externalId: true } });
  const profiles = await fetchNewProfiles(items);

  await db.$transaction(
    async (tx) => {
      for (const item of items) {
        if (item.kind === "inbound" || item.kind === "echo") {
          const account = accounts.find((a) => a.channel === item.channel);
          if (account && item.accountId !== account.externalId && item.accountId !== "SIMULADOR") continue; // another page on the same app
        }
        await applyItem(tx, item, profiles);
      }
    },
    { timeout: 60_000 },
  );
  return items.length;
}
