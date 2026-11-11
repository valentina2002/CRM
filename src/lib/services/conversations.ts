import "server-only";
import { db } from "@/lib/db";
import { markRead } from "@/lib/whatsapp/graph";
import { DomainError, logActivity } from "./core";
import { getSendingCredentials } from "./whatsapp-account";
import { applyWebhookPayload } from "./whatsapp-inbox";
import { isWindowOpen } from "./whatsapp-outbox";

/** Inbox list: conversations with messages (plus `includeContactId`), most recent first. */
export async function listConversations(includeContactId?: string) {
  const rows = await db.conversation.findMany({
    where: { OR: [{ messages: { some: {} } }, ...(includeContactId ? [{ contactId: includeContactId }] : [])] },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    include: {
      contact: { select: { id: true, name: true, company: true, phone: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1, select: { body: true, direction: true, sentAt: true, status: true } },
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
    select: { id: true, name: true, company: true, phone: true, tags: true, conversation: true },
  });
  if (!contact) return null;
  const messages = contact.conversation
    ? (
        await db.message.findMany({
          where: { conversationId: contact.conversation.id },
          orderBy: { sentAt: "desc" },
          take: 300,
        })
      ).reverse()
    : [];
  return { contact, conversation: contact.conversation, messages, windowOpen: isWindowOpen(contact.conversation?.lastInboundAt) };
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

async function queueMessage(contactId: string, data: { type: string; body: string; meta?: object }, origin = "el CRM") {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true, phone: true } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  if (!contact.phone) throw new DomainError(`${contact.name} no tiene número de WhatsApp. Agrégalo en su ficha.`);
  const now = new Date();
  return db.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: { contactId },
      update: { lastMessageAt: now, lastChannel: "WHATSAPP" },
      create: { contactId, lastMessageAt: now, lastChannel: "WHATSAPP" },
    });
    const message = await tx.message.create({
      data: { conversationId: conversation.id, channel: "WHATSAPP", direction: "OUT", via: "CRM", type: data.type, body: data.body, meta: data.meta, status: "QUEUED", sentAt: now },
    });
    await logActivity(tx, { type: "message.queued", text: `WhatsApp enviado a ${contact.name} desde ${origin}` });
    return message;
  });
}

/** Free text from the CRM (goes out through the outbox; only within the 24 h window). */
export async function sendTextMessage(contactId: string, text: string, origin?: string) {
  const thread = await db.conversation.findUnique({ where: { contactId }, select: { lastInboundAt: true } });
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
    where: { conversationId: conversation.id, direction: "IN", externalId: { not: null } },
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
 * events → automations). Lets you test the inbox and automations without a connected number.
 */
export async function simulateWebhook(contactId: string, kind: "inbound" | "echo", text: string) {
  if (!simulatorEnabled()) throw new DomainError("El simulador solo funciona en desarrollo");
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
}
