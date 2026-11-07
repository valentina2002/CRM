import { auth } from "@/auth";
import { invoiceFileName, renderInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoice, getIssuer } from "@/lib/services/invoices";

/** PDF of a cuenta de cobro for the logged-in user (the public API version comes in Phase 5). */
export async function GET(request: Request, { params }: RouteContext<"/cuentas-de-cobro/[id]/pdf">) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const [invoice, issuer] = await Promise.all([getInvoice(id), getIssuer()]);
  if (!invoice) return Response.json({ error: "Cuenta de cobro no encontrada" }, { status: 404 });

  const pdf = await renderInvoicePdf(invoice, issuer);
  const download = new URL(request.url).searchParams.has("descargar");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFileName(invoice)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
