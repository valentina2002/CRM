import { ApiError, apiRoute, ok } from "@/lib/api/handler";
import { serializeInvoice } from "@/lib/api/serialize";
import { db } from "@/lib/db";
import { getInvoice, sendInvoice } from "@/lib/services/invoices";
import { getSendingCredentials } from "@/lib/services/whatsapp-account";
import { isWindowOpen } from "@/lib/services/whatsapp-outbox";

/**
 * POST /api/v1/invoices/{id}/send — queues the WhatsApp text + PDF and marks a draft as Pendiente. The messages
 * leave right after the response. 409 when WhatsApp is not connected or the 24 h window is closed.
 */
export const POST = apiRoute<{ id: string }>(async ({ params }) => {
  const invoice = await getInvoice(params.id);
  if (!invoice) throw new ApiError(404, "Cuenta de cobro no encontrada");
  if (!(await getSendingCredentials())) throw new ApiError(409, "WhatsApp no está conectado. Conéctalo en Ajustes → WhatsApp y API.");
  const conversation = await db.conversation.findUnique({ where: { contactId: invoice.contactId }, select: { lastInboundAt: true } });
  if (invoice.contact.phone && !isWindowOpen(conversation?.lastInboundAt)) {
    throw new ApiError(409, "Fuera de la ventana de 24 h: el cliente debe escribirte primero para poder enviarle la cuenta de cobro por WhatsApp.");
  }
  await sendInvoice(params.id, "whatsapp");
  const updated = await getInvoice(params.id);
  return ok(serializeInvoice(updated ?? invoice));
});
