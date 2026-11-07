import "server-only";
import { db } from "@/lib/db";
import { invoiceFileName, renderInvoicePdf } from "@/lib/invoice-pdf";
import { GraphError, sendDocument, sendTemplate, sendText, uploadMedia } from "@/lib/whatsapp/graph";
import { emit } from "./core";
import { getInvoice, getIssuer } from "./invoices";
import { getSendingCredentials } from "./whatsapp-account";

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta's customer-service window: free-form messages only within 24 h of the customer's last message. */
export function isWindowOpen(lastInboundAt: Date | null | undefined, now = new Date()) {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < WINDOW_MS);
}

type TemplateMeta = { template: string; language: string; params?: string[] };
type DocumentMeta = { invoiceId: string; fileName?: string };

function explain(error: unknown) {
  if (error instanceof GraphError) {
    if (error.code === 131047) return "Fuera de la ventana de 24 h: el cliente debe escribir primero o envía una plantilla.";
    if (error.code === 190) return "El token de WhatsApp no es válido o expiró. Vuelve a conectar WhatsApp en Ajustes.";
    return `Meta: ${error.message}${error.code ? ` (${error.code})` : ""}`;
  }
  return error instanceof Error ? error.message : "Error al enviar";
}

/**
 * Sends QUEUED outgoing WhatsApp messages (from the CRM, automations, invoices). Without a connected
 * account they stay queued. Text/documents outside the 24 h window fail with a clear message.
 */
export async function processOutbox(limit = 20) {
  const creds = await getSendingCredentials();
  if (!creds) return { sent: 0, failed: 0 };

  const queued = await db.message.findMany({
    where: { channel: "WHATSAPP", direction: "OUT", status: "QUEUED" },
    orderBy: { sentAt: "asc" },
    take: limit,
    include: { conversation: { include: { contact: { select: { id: true, phone: true } } } } },
  });

  let sent = 0;
  let failed = 0;
  for (const m of queued) {
    // Claim it so two concurrent runs never send twice.
    const claimed = await db.message.updateMany({ where: { id: m.id, status: "QUEUED" }, data: { status: "SENT", error: null } });
    if (!claimed.count) continue;

    const fail = async (error: string) => {
      failed++;
      await db.message.update({ where: { id: m.id }, data: { status: "FAILED", error } });
    };

    const to = m.conversation.contact.phone?.replace(/^\+/, "");
    if (!to) {
      await fail("El contacto no tiene número de WhatsApp");
      continue;
    }
    if (m.type !== "template" && !isWindowOpen(m.conversation.lastInboundAt)) {
      await fail("Fuera de la ventana de 24 h: el cliente no te ha escrito en las últimas 24 horas. Usa una plantilla aprobada.");
      continue;
    }

    try {
      let wamid: string;
      if (m.type === "template") {
        const meta = m.meta as TemplateMeta;
        wamid = await sendTemplate(creds.token, creds.phoneNumberId, to, meta.template, meta.language, meta.params ?? []);
      } else if (m.type === "document") {
        const meta = m.meta as DocumentMeta;
        const [invoice, issuer] = await Promise.all([getInvoice(meta.invoiceId), getIssuer()]);
        if (!invoice) throw new Error("La cuenta de cobro ya no existe");
        const fileName = invoiceFileName(invoice);
        const pdf = await renderInvoicePdf(invoice, issuer);
        const mediaId = await uploadMedia(creds.token, creds.phoneNumberId, new Uint8Array(pdf), "application/pdf", fileName);
        wamid = await sendDocument(creds.token, creds.phoneNumberId, to, mediaId, fileName, `Cuenta de cobro ${invoice.number}`);
        await db.message.update({ where: { id: m.id }, data: { mediaId } });
      } else {
        wamid = await sendText(creds.token, creds.phoneNumberId, to, m.body ?? "");
      }
      await db.$transaction(async (tx) => {
        await tx.message.update({ where: { id: m.id }, data: { externalId: wamid, status: "SENT", sentAt: new Date() } });
        // For outgoing webhooks (Phase 5); no automation listens to message.sent.
        await emit(tx, "message.sent", { contactId: m.conversation.contact.id, messageId: m.id, wamid, via: m.via ?? "CRM" });
      });
      sent++;
    } catch (error) {
      await fail(explain(error));
    }
  }
  return { sent, failed };
}
