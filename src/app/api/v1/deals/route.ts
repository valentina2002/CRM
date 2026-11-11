import { apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseDealCreate, parseDealQuery } from "@/lib/api/schemas";
import { serializeDeal } from "@/lib/api/serialize";
import { createDeal, listDeals } from "@/lib/services/deals";

/** GET /api/v1/deals?stage=&contactId= */
export const GET = apiRoute(async ({ url }) => {
  const rows = await listDeals(valid(parseDealQuery(url.searchParams)));
  return ok(rows.map(serializeDeal), { total: rows.length });
});

/** POST /api/v1/deals — `{ contactId, title, stage?, value? }` (stage defaults to Prospecto). */
export const POST = apiRoute(async ({ request }) => {
  const deal = await createDeal(valid(parseDealCreate(await readJson(request))));
  return ok(serializeDeal(deal), {}, 201);
});
