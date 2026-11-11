import { ApiError, apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseInvoicePay } from "@/lib/api/schemas";
import { serializeInvoice } from "@/lib/api/serialize";
import { getInvoice, markInvoicePaid } from "@/lib/services/invoices";

/** POST /api/v1/invoices/{id}/pay — optional `{ paidAt: "YYYY-MM-DD" }` (default: today). Emits `invoice.paid`. */
export const POST = apiRoute<{ id: string }>(async ({ request, params }) => {
  const { paidAt } = valid(parseInvoicePay(await readJson(request)));
  await markInvoicePaid(params.id, paidAt);
  const invoice = await getInvoice(params.id);
  if (!invoice) throw new ApiError(404, "Cuenta de cobro no encontrada");
  return ok(serializeInvoice(invoice));
});
