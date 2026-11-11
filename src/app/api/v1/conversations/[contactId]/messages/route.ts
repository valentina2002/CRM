import { ApiError, apiRoute, ok, valid } from "@/lib/api/handler";
import { parseMessageQuery } from "@/lib/api/schemas";
import { serializeMessage } from "@/lib/api/serialize";
import { getContact } from "@/lib/services/contacts";
import { listMessages } from "@/lib/services/conversations";

/** GET /api/v1/conversations/{contactId}/messages?limit= — latest messages (default 100, max 300), oldest first. */
export const GET = apiRoute<{ contactId: string }>(async ({ url, params }) => {
  const { limit } = valid(parseMessageQuery(url.searchParams));
  if (!(await getContact(params.contactId))) throw new ApiError(404, "Contacto no encontrado");
  const { rows, total } = await listMessages(params.contactId, limit);
  return ok(rows.map(serializeMessage), { total });
});
