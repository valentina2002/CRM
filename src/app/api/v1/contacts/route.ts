import { apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseContactCreate, parseContactQuery } from "@/lib/api/schemas";
import { serializeContact } from "@/lib/api/serialize";
import { API_PAGE_SIZE, createContact, searchContacts } from "@/lib/services/contacts";

/** GET /api/v1/contacts?q=&tag=&page= — list / search contacts (50 per page, newest first). */
export const GET = apiRoute(async ({ url }) => {
  const query = valid(parseContactQuery(url.searchParams));
  const { rows, total } = await searchContacts(query);
  return ok(rows.map(serializeContact), { total, page: query.page, pageSize: API_PAGE_SIZE });
});

/** POST /api/v1/contacts — creates the contact, its "Prospecto" deal and emits `contact.created`. */
export const POST = apiRoute(async ({ request }) => {
  const input = valid(parseContactCreate(await readJson(request)));
  const contact = await createContact(input, "api");
  return ok(serializeContact(contact), {}, 201);
});
