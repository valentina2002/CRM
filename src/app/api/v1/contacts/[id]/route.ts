import { ApiError, apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseContactPatch } from "@/lib/api/schemas";
import { serializeContact } from "@/lib/api/serialize";
import { deleteContact, getContact, updateContact } from "@/lib/services/contacts";

type Params = { id: string };

async function load(id: string) {
  const contact = await getContact(id);
  if (!contact) throw new ApiError(404, "Contacto no encontrado");
  return contact;
}

export const GET = apiRoute<Params>(async ({ params }) => ok(serializeContact(await load(params.id))));

/** PATCH — only the fields sent change (tags replace the whole list). */
export const PATCH = apiRoute<Params>(async ({ request, params }) => {
  const current = await load(params.id);
  const input = valid(parseContactPatch(current, await readJson(request)));
  return ok(serializeContact(await updateContact(params.id, input)));
});

/** DELETE — 409 when the contact has cuentas de cobro (they are billing records). */
export const DELETE = apiRoute<Params>(async ({ params }) => {
  await deleteContact(params.id);
  return new Response(null, { status: 204 });
});
