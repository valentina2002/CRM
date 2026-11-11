import "server-only";
import type { MessageStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formatPhone, normalizePhone } from "@/lib/format";
import { isSocialPayload } from "@/lib/meta/messaging-parser";
import { parseWebhook, type ParsedItem, type Peer } from "@/lib/whatsapp/webhook-parser";
import { emit, logActivity, type Tx } from "./core";
import { applySocialPayload } from "./social-inbox";
import { getWhatsAppAccount, updateSyncState } from "./whatsapp-account";

const uidKey = (userId: string) => `uid:${userId}`;

/** Finds the CRM contact for a WhatsApp peer (by phone/wa_id, then by BSUID). */
async function findContact(tx: Tx, peer: Peer) {
  const keys = [peer.waId, peer.userId ? uidKey(peer.userId) : null].filter((k): k is string => Boolean(k));
  if (keys.length) {
    const channel = await tx.contactChannel.findFirst({ where: { channel: "WHATSAPP", externalId: { in: keys } }, include: { contact: true } });
    if (channel) return channel.contact;
  }
  const phone = peer.waId ? normalizePhone(`+${peer.waId}`) : null;
  return phone ? tx.contact.findUnique({ where: { phone } }) : null;
}

/** Makes sure both identities (wa_id and BSUID) point to the contact. */
async function linkIdentities(tx: Tx, contactId: string, peer: Peer) {
  for (const externalId of [peer.waId, peer.userId ? uidKey(peer.userId) : null]) {
    if (!externalId) continue;
    await tx.contactChannel.upsert({
      where: { channel_externalId: { channel: "WHATSAPP", externalId } },
      update: {},
      create: { contactId, channel: "WHATSAPP", externalId },
    });
  }
}

/**
 * Finds or creates the contact. New contacts get a "Prospecto" deal and a conversation, like contacts
 * created by hand. `emitCreated` only for live inbound messages (not for history/app sync imports, so
 * the welcome automation doesn't message hundreds of old contacts).
 */
async function resolveContact(tx: Tx, peer: Peer, opts: { source: string; emitCreated: boolean }) {
  const existing = await findContact(tx, peer);
  if (existing) {
    await linkIdentities(tx, existing.id, peer);
    // Replace an auto-generated name (the phone number) with the real one when we learn it.
    if (peer.name && existing.name === formatPhone(existing.phone)) {
      return tx.contact.update({ where: { id: existing.id }, data: { name: peer.name } });
    }
    return existing;
  }
  const phone = peer.waId ? normalizePhone(`+${peer.waId}`) : null;
  const name = peer.name?.trim() || formatPhone(phone) || "Contacto de WhatsApp";
  const contact = await tx.contact.create({ data: { name, phone, source: opts.source, tags: ["whatsapp"] } });
  await linkIdentities(tx, contact.id, peer);
  await tx.deal.create({ data: { contactId: contact.id, title: "Nueva oportunidad (WhatsApp)", stage: "PROSPECT" } });
  await tx.conversation.create({ data: { contactId: contact.id, lastChannel: "WHATSAPP" } });
  await logActivity(tx, { type: "contact.created", text: `Nuevo contacto desde WhatsApp: ${contact.name}`, contactId: contact.id });
  if (opts.emitCreated) await emit(tx, "contact.created", { contactId: contact.id, source: opts.source });
  return contact;
}

async function conversationFor(tx: Tx, contactId: string) {
  return tx.conversation.upsert({ where: { contactId }, update: {}, create: { contactId, lastChannel: "WHATSAPP" } });
}

const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

async function applyItem(tx: Tx, item: ParsedItem) {
  switch (item.kind) {
    case "inbound": {
      if (await tx.message.findUnique({ where: { channel_externalId: { channel: "WHATSAPP", externalId: item.wamid } } })) return; // idempotent
      const contact = await resolveContact(tx, item.peer, { source: "whatsapp", emitCreated: true });
      const conversation = await conversationFor(tx, contact.id);
      await tx.message.create({
        data: { conversationId: conversation.id, channel: "WHATSAPP", externalId: item.wamid, direction: "IN", type: item.type, body: item.body, status: "RECEIVED", sentAt: item.at },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          unread: { increment: 1 },
          lastInboundAt: !conversation.lastInboundAt || conversation.lastInboundAt < item.at ? item.at : undefined,
          lastMessageAt: !conversation.lastMessageAt || conversation.lastMessageAt < item.at ? item.at : undefined,
          lastChannel: "WHATSAPP",
        },
      });
      await logActivity(tx, { type: "message.received", text: `WhatsApp entrante de ${contact.name}` });
      await emit(tx, "message.received", { contactId: contact.id, text: item.body, wamid: item.wamid, channel: "WHATSAPP" });
      return;
    }

    case "status": {
      const message = await tx.message.findUnique({ where: { channel_externalId: { channel: "WHATSAPP", externalId: item.wamid } } });
      if (!message) return;
      if (item.status === "failed") {
        await tx.message.update({ where: { id: message.id }, data: { status: "FAILED", error: item.error ?? "Meta no pudo entregar el mensaje" } });
        return;
      }
      if (item.status === "other") return;
      const next = item.status.toUpperCase() as MessageStatus;
      // Webhooks can arrive out of order: never go backwards (read → delivered).
      if ((STATUS_RANK[next] ?? 0) > (STATUS_RANK[message.status] ?? -1)) {
        await tx.message.update({ where: { id: message.id }, data: { status: next } });
      }
      return;
    }

    case "echo": {
      if (item.editOf || item.revokes) {
        const original = await tx.message.findUnique({ where: { channel_externalId: { channel: "WHATSAPP", externalId: (item.editOf ?? item.revokes)! } } });
        if (original) {
          await tx.message.update({
            where: { id: original.id },
            data: { body: item.revokes ? "🚫 Mensaje eliminado" : item.body, meta: { ...(original.meta as object | null), edited: Boolean(item.editOf), revoked: Boolean(item.revokes) } },
          });
        }
        return;
      }
      if (await tx.message.findUnique({ where: { channel_externalId: { channel: "WHATSAPP", externalId: item.wamid } } })) return;
      const contact = await resolveContact(tx, item.peer, { source: "whatsapp", emitCreated: false });
      const conversation = await conversationFor(tx, contact.id);
      await tx.message.create({
        data: { conversationId: conversation.id, channel: "WHATSAPP", externalId: item.wamid, direction: "OUT", via: "APP", type: item.type, body: item.body, status: "SENT", sentAt: item.at },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: !conversation.lastMessageAt || conversation.lastMessageAt < item.at ? item.at : undefined },
      });
      await logActivity(tx, { type: "message.echo", text: `Respuesta desde el celular a ${contact.name} (coexistencia)` });
      return;
    }

    case "history_message": {
      if (await tx.message.findUnique({ where: { channel_externalId: { channel: "WHATSAPP", externalId: item.wamid } } })) return;
      const contact = await resolveContact(tx, item.peer, { source: "app_sync", emitCreated: false });
      const conversation = await conversationFor(tx, contact.id);
      const status: MessageStatus = item.fromBusiness
        ? item.status === "read" || item.status === "played"
          ? "READ"
          : item.status === "delivered"
            ? "DELIVERED"
            : item.status === "error"
              ? "FAILED"
              : "SENT"
        : "RECEIVED";
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          channel: "WHATSAPP",
          externalId: item.wamid,
          direction: item.fromBusiness ? "OUT" : "IN",
          via: "HISTORY",
          type: item.type,
          body: item.body,
          status,
          sentAt: item.at,
        },
      });
      // History never opens the 24 h window nor counts as unread.
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: !conversation.lastMessageAt || conversation.lastMessageAt < item.at ? item.at : undefined },
      });
      return;
    }

    case "contact_sync": {
      if (item.action === "remove") return; // never delete CRM contacts because they left the phone's address book
      await resolveContact(tx, item.peer, { source: "app_sync", emitCreated: false });
      return;
    }

    default:
      return;
  }
}

/** Applies one webhook payload. History progress/errors update the sync state outside the transaction. */
export async function applyWebhookPayload(payload: unknown) {
  const items = parseWebhook(payload);
  const account = await getWhatsAppAccount();
  let contactsImported = 0;

  await db.$transaction(
    async (tx) => {
      for (const item of items) {
        if ((item.kind === "inbound" || item.kind === "echo") && account?.phoneNumberId && item.phoneNumberId && item.phoneNumberId !== account.phoneNumberId) {
          continue; // another number on the same app
        }
        await applyItem(tx, item);
        if (item.kind === "contact_sync" && item.action === "add") contactsImported++;
      }
    },
    { timeout: 60_000 },
  );

  for (const item of items) {
    if (item.kind === "history_progress" && item.progress !== null) {
      await updateSyncState({ historyProgress: item.progress }, item.progress >= 100 ? { historySynced: true } : {});
    }
    if (item.kind === "history_error") {
      await updateSyncState({
        historyError:
          item.code === 2593109
            ? "El historial no se importó: en la app WhatsApp Business está desactivado compartir el historial."
            : item.message,
      });
    }
  }
  if (contactsImported && account) await updateSyncState({ contactsImported: (account.sync.contactsImported ?? 0) + contactsImported });
  return items.length;
}

/** Processes stored webhook payloads (WebhookInbox) in arrival order: WhatsApp, Messenger and Instagram. Returns how many were processed. */
export async function processWebhookInbox(limit = 25) {
  const rows = await db.webhookInbox.findMany({ where: { processed: false, error: null }, orderBy: { receivedAt: "asc" }, take: limit });
  let done = 0;
  for (const row of rows) {
    try {
      if (isSocialPayload(row.payload)) await applySocialPayload(row.payload);
      else await applyWebhookPayload(row.payload);
      await db.webhookInbox.update({ where: { id: row.id }, data: { processed: true } });
      done++;
    } catch (error) {
      console.error("Error procesando webhook de Meta", row.id, error);
      await db.webhookInbox.update({ where: { id: row.id }, data: { error: error instanceof Error ? error.message.slice(0, 500) : "Error" } });
    }
  }
  return done;
}
