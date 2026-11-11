import { ApiError, apiRoute } from "@/lib/api/handler";
import { invoiceFileName, renderInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoice, getIssuer } from "@/lib/services/invoices";

/** GET /api/v1/invoices/{id}/pdf — the cuenta de cobro as a PDF file. */
export const GET = apiRoute<{ id: string }>(async ({ params }) => {
  const [invoice, issuer] = await Promise.all([getInvoice(params.id), getIssuer()]);
  if (!invoice) throw new ApiError(404, "Cuenta de cobro no encontrada");
  const pdf = await renderInvoicePdf(invoice, issuer);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoiceFileName(invoice)}"` },
  });
});
