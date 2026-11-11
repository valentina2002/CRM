import "server-only";
import type { Channel } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { SocialChannel } from "@/lib/meta/messaging-parser";
import { sendSocialText } from "@/lib/meta/page-graph";
import { GraphError } from "@/lib/whatsapp/graph";
import { emit, isUniqueViolation } from "./core";
import { getSocialCredentials, SOCIAL_CHANNELS } from "./social-account";
import { isWindowOpen } from "./whatsapp-outbox";

/** Last time the customer wrote on this channel (imported history never opens a window). */
export async function lastInboundOn(conversationId: string, channel: Channel) {
  const last = await db.message.findFirst({
    // `via` is null on live inbound messages: a plain NOT { via: HISTORY } would drop them (SQL NULL logic).
    where: { conversationId, channel, direction: "IN", OR: [{ via: null }, { via: { not: "HISTORY" } }] },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  return last?.sentAt ?? null;
}

function explain(error: unknown) {
  if (error instanceof GraphError) {
    if (error.code === 190) return "El token de la página no es válido o expiró. Vuelve a conectar Facebook en Ajustes.";
    return `Meta: ${error.message}${error.code ? ` (${error.code})` : ""}`;
  }
  return error instanceof Error ? error.message : "Error al enviar";
}

/**
 * Sends QUEUED outgoing Messenger / Instagram messages (from the CRM and automations). Without a connected
 * Page they stay queued. Only text, and only inside the 24 h window of that channel.
 */
export async function processSocialOutbox(limit = 20) {
  const queued = await db.message.findMany({
    where: { channel: { in: [...SOCIAL_CHANNELS] }, direction: "OUT", status: "QUEUED" },
    orderBy: { sentAt: "asc" },
    take: limit,
    include: { conversation: { include: { contact: { select: { id: true, channels: true } } } } },
  });
  let sent = 0;
  let failed = 0;
  if (queued.length === 0) return { sent, failed };

  const credsByChannel = new Map<SocialChannel, Awaited<ReturnType<typeof getSocialCredentials>>>();
  for (const channel of SOCIAL_CHANNELS) credsByChannel.set(channel, await getSocialCredentials(channel).catch(() => null));

  for (const m of queued) {
    const channel = m.channel as SocialChannel;
    const creds = credsByChannel.get(channel);
    if (!creds) continue; // not connected: stays queued

    // Claim it so two concurrent runs never send twice.
    const claimed = await db.message.updateMany({ where: { id: m.id, status: "QUEUED" }, data: { status: "SENT", error: null } });
    if (!claimed.count) continue;
    const fail = async (error: string) => {
      failed++;
      await db.message.update({ where: { id: m.id }, data: { status: "FAILED", error } });
    };

    const label = channel === "FACEBOOK" ? "Facebook" : "Instagram";
    const identity = m.conversation.contact.channels.filter((c) => c.channel === channel).at(-1);
    if (!identity) {
      await fail(`Este contacto no tiene una conversación de ${label}`);
      continue;
    }
    if (!isWindowOpen(await lastInboundOn(m.conversationId, channel))) {
      await fail(`Fuera de la ventana de 24 h: en ${label} solo puedes responder durante las 24 horas siguientes al último mensaje del cliente.`);
      continue;
    }

    try {
      const mid = await sendSocialText(creds.token, creds.pageId, identity.externalId, m.body ?? "");
      try {
        await db.message.update({ where: { id: m.id }, data: { externalId: mid, status: "SENT", sentAt: new Date() } });
      } catch (error) {
        if (!isUniqueViolation(error, "externalId")) throw error;
        // The echo webhook won the race and stored this message as "sent from the app": keep ours.
        await db.message.deleteMany({ where: { channel, externalId: mid, id: { not: m.id } } });
        await db.message.update({ where: { id: m.id }, data: { externalId: mid, status: "SENT", sentAt: new Date() } });
      }
      // For outgoing webhooks; no automation listens to message.sent.
      await db.$transaction((tx) => emit(tx, "message.sent", { contactId: m.conversation.contact.id, messageId: m.id, mid, channel, via: m.via ?? "CRM" }));
      sent++;
    } catch (error) {
      await fail(explain(error));
    }
  }
  return { sent, failed };
}
