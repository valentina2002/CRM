import { apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseInvoiceCreate, parseInvoiceQuery } from "@/lib/api/schemas";
import { serializeInvoice } from "@/lib/api/serialize";
import { createInvoice, listInvoices } from "@/lib/services/invoices";

/** GET /api/v1/invoices?status=&contactId= */
export const GET = apiRoute(async ({ url }) => {
  const rows = await listInvoices(valid(parseInvoiceQuery(url.searchParams)));
  return ok(rows.map(serializeInvoice), { total: rows.length });
});

/** POST /api/v1/invoices — creates a draft. issueDate defaults to today and dueDate to 15 days later. */
export const POST = apiRoute(async ({ request }) => {
  const invoice = await createInvoice(valid(parseInvoiceCreate(await readJson(request))));
  return ok(serializeInvoice(invoice), {}, 201);
});
