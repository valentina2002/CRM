import { ApiError, apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseMessageCreate } from "@/lib/api/schemas";
import { serializeMessage } from "@/lib/api/serialize";
import { db } from "@/lib/db";
import { sendTextMessage } from "@/lib/services/conversations";
import { getSendingCredentials } from "@/lib/services/whatsapp-account";
import { processOutbox } from "@/lib/services/whatsapp-outbox";

/**
 * POST /api/v1/messages — `{ contactId | to, text }`. Sends a WhatsApp text through the Cloud API and waits
 * for Meta's answer. 409 when WhatsApp is not connected or the 24 h window is closed.
 */
export const POST = apiRoute(async ({ request }) => {
  const input = valid(parseMessageCreate(await readJson(request)));
  const contact = input.contactId
    ? await db.contact.findUnique({ where: { id: input.contactId }, select: { id: true } })
    : await db.contact.findUnique({ where: { phone: input.to ?? "" }, select: { id: true } });
  if (!contact) throw new ApiError(404, input.contactId ? "Contacto no encontrado" : "No hay un contacto con ese WhatsApp. Créalo primero con POST /contacts.");
  if (!(await getSendingCredentials())) throw new ApiError(409, "WhatsApp no está conectado. Conéctalo en Ajustes → WhatsApp y API.");

  const queued = await sendTextMessage(contact.id, input.text, "la API"); // 409 outside the 24 h window
  await processOutbox();
  const message = await db.message.findUnique({ where: { id: queued.id } });
  if (!message) throw new ApiError(500, "Error interno del servidor");
  if (message.status === "FAILED") throw new ApiError(502, message.error ?? "Meta rechazó el mensaje", { data: serializeMessage(message) });
  return ok(serializeMessage(message), {}, 201);
});
