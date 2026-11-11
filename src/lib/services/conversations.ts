import "server-only";
import type { Channel } from "@/generated/prisma/enums";
import { CHANNEL_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import type { SocialChannel } from "@/lib/meta/messaging-parser";
import { markRead } from "@/lib/whatsapp/graph";
import { DomainError, logActivity } from "./core";
import { isSocialChannel } from "./social-account";
import { applySocialPayload } from "./social-inbox";
import { lastInboundOn } from "./social-outbox";
import { getSendingCredentials } from "./whatsapp-account";
import { applyWebhookPayload } from "./whatsapp-inbox";
import { isWindowOpen } from "./whatsapp-outbox";

/** A channel this contact can be written to, with its 24 h window. */
export type ThreadChannel = { channel: Channel; label: string; handle: string | null; windowOpen: boolean };

/** Inbox list: conversations with messages (plus `includeContactId`), most recent first. */
export async function listConversations(includeContactId?: string) {
  const rows = await db.conversation.findMany({
    where: { OR: [{ messages: { some: {} } }, ...(includeContactId ? [{ contactId: includeContactId }] : [])] },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    include: {
      contact: { select: { id: true, name: true, company: true, phone: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1, select: { body: true, direction: true, sentAt: true, status: true, channel: true } },
    },
  });
  return rows.map((c) => ({
    contactId: c.contactId,
    name: c.contact.name,
    company: c.contact.company,
    unread: c.unread,
    last: c.messages[0] ?? null,
  }));
}

export async function getThread(contactId: string) {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, company: true, phone: true, tags: true, conversation: true, channels: { orderBy: { createdAt: "asc" } } },
  });
  if (!contact) return null;
  const conversation = contact.conversation;
  const messages = conversation
    ? (
        await db.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { sentAt: "desc" },
          take: 300,
        })
      ).reverse()
    : [];

  // Channels the contact can be reached on: WhatsApp (phone number) and one per Facebook / Instagram identity.
  const channels: ThreadChannel[] = [];
  if (contact.phone) {
    channels.push({ channel: "WHATSAPP", label: CHANNEL_LABEL.WHATSAPP, handle: formatPhone(contact.phone), windowOpen: isWindowOpen(conversation?.lastInboundAt) });
  }
  for (const channel of ["FACEBOOK", "INSTAGRAM"] as const) {
    const identity = contact.channels.filter((c) => c.channel === channel).at(-1);
    if (!identity) continue;
    channels.push({
      channel,
      label: CHANNEL_LABEL[channel],
      handle: identity.handle,
      windowOpen: conversation ? isWindowOpen(await lastInboundOn(conversation.id, channel)) : false,
    });
  }
  // Reply by default on the channel the customer last wrote on.
  const defaultChannel = channels.find((c) => c.channel === conversation?.lastChannel)?.channel ?? channels[0]?.channel ?? null;
  return { contact, conversation, messages, channels, defaultChannel, windowOpen: isWindowOpen(conversation?.lastInboundAt) };
}

/** Latest messages of a contact's unified thread, oldest first (REST API). */
export async function listMessages(contactId: string, limit: number) {
  const conversation = await db.conversation.findUnique({ where: { contactId }, select: { id: true } });
  if (!conversation) return { rows: [], total: 0 };
  const [rows, total] = await Promise.all([
    db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { sentAt: "desc" }, take: limit }),
    db.message.count({ where: { conversationId: conversation.id } }),
  ]);
  return { rows: rows.reverse(), total };
}

async function queueMessage(contactId: string, data: { type: string; body: string; meta?: object }, origin = "el CRM", channel: Channel = "WHATSAPP") {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true, phone: true, channels: { select: { channel: true } } } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  const label = CHANNEL_LABEL[channel];
  if (channel === "WHATSAPP") {
    if (!contact.phone) throw new DomainError(`${contact.name} no tiene número de WhatsApp. Agrégalo en su ficha.`);
  } else if (!contact.channels.some((c) => c.channel === channel)) {
    throw new DomainError(`${contact.name} no te ha escrito por ${label}: solo puedes responderle por un canal por el que ya te escribió.`);
  }
  const now = new Date();
  return db.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: { contactId },
      update: { lastMessageAt: now },
      create: { contactId, lastMessageAt: now, lastChannel: channel },
    });
    const message = await tx.message.create({
      data: { conversationId: conversation.id, channel, direction: "OUT", via: "CRM", type: data.type, body: data.body, meta: data.meta, status: "QUEUED", sentAt: now },
    });
    await logActivity(tx, { type: "message.queued", text: `${label} enviado a ${contact.name} desde ${origin}` });
    return message;
  });
}

/** Free text from the CRM (goes out through the outbox of that channel; only within its 24 h window). */
export async function sendTextMessage(contactId: string, text: string, origin?: string, channel: Channel = "WHATSAPP") {
  const thread = await db.conversation.findUnique({ where: { contactId }, select: { id: true, lastInboundAt: true } });
  if (isSocialChannel(channel)) {
    if (!thread || !isWindowOpen(await lastInboundOn(thread.id, channel))) {
      throw new DomainError(
        `Fuera de la ventana de 24 h: en ${CHANNEL_LABEL[channel]} solo puedes responder durante las 24 horas siguientes al último mensaje del cliente.`,
        "conflict",
      );
    }
    if (text.length > 1000) throw new DomainError(`En ${CHANNEL_LABEL[channel]} el mensaje puede tener máximo 1000 caracteres.`);
    return queueMessage(contactId, { type: "text", body: text }, origin, channel);
  }
  if (channel !== "WHATSAPP") throw new DomainError(`${CHANNEL_LABEL[channel]} todavía no está disponible en el CRM.`);
  if (!isWindowOpen(thread?.lastInboundAt)) {
    throw new DomainError("Fuera de la ventana de 24 h: solo puedes enviar una plantilla aprobada hasta que el cliente te escriba.", "conflict");
  }
  return queueMessage(contactId, { type: "text", body: text }, origin);
}

export async function sendTemplateMessage(contactId: string, t: { name: string; language: string; params: string[]; preview: string }) {
  return queueMessage(contactId, { type: "template", body: t.preview, meta: { template: t.name, language: t.language, params: t.params } });
}

/** Opens a conversation: unread → 0 and blue ticks for the customer (best effort). */
export async function markConversationRead(contactId: string) {
  const conversation = await db.conversation.findUnique({ where: { contactId } });
  if (!conversation || conversation.unread === 0) return false;
  await db.conversation.update({ where: { id: conversation.id }, data: { unread: 0 } });
  const lastIn = await db.message.findFirst({
    where: { conversationId: conversation.id, channel: "WHATSAPP", direction: "IN", externalId: { not: null } },
    orderBy: { sentAt: "desc" },
  });
  const creds = await getSendingCredentials().catch(() => null);
  if (creds && lastIn?.externalId && !lastIn.externalId.startsWith("wamid.SIM")) {
    await markRead(creds.token, creds.phoneNumberId, lastIn.externalId).catch(() => {});
  }
  return true;
}

export async function retryMessage(messageId: string) {
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message || message.direction !== "OUT") throw new DomainError("Mensaje no encontrado", "not_found");
  if (message.status !== "FAILED") throw new DomainError("Solo se pueden reintentar mensajes fallidos");
  await db.message.update({ where: { id: messageId }, data: { status: "QUEUED", error: null } });
}

// ---------- Development simulator (never enabled in production) ----------

export const simulatorEnabled = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_WHATSAPP_SIMULATOR === "1";

/**
 * Builds a payload exactly like Meta's and runs it through the real webhook pipeline (parser → inbox →
 * events → automations). Lets you test the inbox and automations without a connected number or page.
 * On Facebook / Instagram a contact without an identity there arrives as a NEW contact (as it really happens:
 * Meta gives no phone number), which is the case "Fusionar" solves.
 */
export async function simulateWebhook(contactId: string, kind: "inbound" | "echo", text: string, channel: Channel = "WHATSAPP") {
  if (!simulatorEnabled()) throw new DomainError("El simulador solo funciona en desarrollo");
  if (isSocialChannel(channel)) return simulateSocial(contactId, kind, text, channel);
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { name: true, phone: true } });
  if (!contact?.phone) throw new DomainError("El contacto necesita un número de WhatsApp para simular");
  const waId = contact.phone.replace(/^\+/, "");
  const ts = String(Math.floor(Date.now() / 1000));
  const wamid = `wamid.SIM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = { display_phone_number: "573000000000", phone_number_id: "SIMULADOR" };
  const value =
    kind === "inbound"
      ? { messaging_product: "whatsapp", metadata, contacts: [{ profile: { name: contact.name }, wa_id: waId }], messages: [{ from: waId, id: wamid, timestamp: ts, type: "text", text: { body: text } }] }
      : { messaging_product: "whatsapp", metadata, contacts: [{ wa_id: waId }], message_echoes: [{ from: metadata.display_phone_number, to: waId, id: wamid, timestamp: ts, type: "text", text: { body: text } }] };
  const payload = { object: "whatsapp_business_account", entry: [{ id: "SIM", changes: [{ field: kind === "inbound" ? "messages" : "smb_message_echoes", value }] }] };
  await db.webhookInbox.create({ data: { source: "simulator", payload, processed: true } });
  await applyWebhookPayload(payload);
  return { newContact: false };
}

async function simulateSocial(contactId: string, kind: "inbound" | "echo", text: string, channel: SocialChannel) {
  const identity = await db.contactChannel.findFirst({ where: { contactId, channel }, orderBy: { createdAt: "desc" } });
  if (!identity && kind === "echo") throw new DomainError(`Este contacto aún no te ha escrito por ${CHANNEL_LABEL[channel]}`);
  const peerId = identity?.externalId ?? `SIM${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const account = "SIMULADOR";
  const mid = `m_SIM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const event =
    kind === "inbound"
      ? { sender: { id: peerId }, recipient: { id: account }, timestamp: Date.now(), message: { mid, text } }
      : { sender: { id: account }, recipient: { id: peerId }, timestamp: Date.now(), message: { mid, text, is_echo: true } };
  const payload = { object: channel === "FACEBOOK" ? "page" : "instagram", entry: [{ id: account, time: Date.now(), messaging: [event] }] };
  await db.webhookInbox.create({ data: { source: "simulator", payload, processed: true } });
  await applySocialPayload(payload);
  return { newContact: !identity };
}
