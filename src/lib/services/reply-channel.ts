import "server-only";
import type { Channel } from "@/generated/prisma/enums";
import type { Tx } from "./core";

/**
 * Channel an automatic message should leave on: the one the customer last wrote on when it is Facebook or
 * Instagram and the contact has an identity there; otherwise WhatsApp if there is a number; otherwise the
 * contact's most recent Facebook / Instagram identity.
 */
export async function replyChannel(tx: Tx, contactId: string, lastChannel: Channel | null, hasPhone: boolean): Promise<Channel> {
  const identities = await tx.contactChannel.findMany({
    where: { contactId, channel: { in: ["FACEBOOK", "INSTAGRAM"] } },
    orderBy: { createdAt: "desc" },
    select: { channel: true },
  });
  if (lastChannel && identities.some((i) => i.channel === lastChannel)) return lastChannel;
  if (hasPhone) return "WHATSAPP";
  return identities[0]?.channel ?? "WHATSAPP";
}
