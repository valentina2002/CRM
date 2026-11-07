import { ChevronLeft, Download, FileText, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { CopyTextButton } from "@/components/invoices/copy-text-button";
import { DuplicateButton, MarkSentButton, SendWhatsAppButton } from "@/components/invoices/invoice-actions";
import { InvoiceDocument, invoicePlainText } from "@/components/invoices/invoice-document";
import { InvoiceEditorDialog } from "@/components/invoices/invoice-editor-dialog";
import { PayDialog } from "@/components/invoices/pay-dialog";
import { InvoiceStatusChip } from "@/components/invoices/status-chip";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { invoiceTotal } from "@/lib/dashboard";
import { formatDateTime, formatDay } from "@/lib/format";
import { listContactOptions } from "@/lib/services/contacts";
import { getInvoice, getIssuer } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";
import { deleteInvoiceAndLeaveAction } from "../actions";

export const metadata: Metadata = { title: "Cuenta de cobro" };

export default function InvoicePage({ params }: PageProps<"/cuentas-de-cobro/[id]">) {
  return (
    <>
      <Link href="/cuentas-de-cobro" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Cuentas de cobro
      </Link>
      <Suspense fallback={<PageSkeleton title="Cuenta de cobro" />}>
        <InvoiceView params={params} />
      </Suspense>
    </>
  );
}

async function InvoiceView({ params }: { params: PageProps<"/cuentas-de-cobro/[id]">["params"] }) {
  await requireUser();
  const { id } = await params;
  const [invoice, issuer, contacts] = await Promise.all([getInvoice(id), getIssuer(), listContactOptions()]);
  if (!invoice) notFound();

  const total = invoiceTotal(invoice);
  const paid = invoice.status === "PAID";
  const pdfUrl = `/cuentas-de-cobro/${invoice.id}/pdf`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[10px] border bg-card p-[14px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold">{invoice.number}</h1>
            <InvoiceStatusChip status={invoice.status} />
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            <Link href={`/contactos/${invoice.contact.id}`} className="hover:text-primary hover:underline">
              {invoice.contact.name}
            </Link>
            {invoice.sentAt ? ` · enviada ${formatDateTime(invoice.sentAt)}` : ""}
            {paid && invoice.paidAt ? ` · pagada el ${formatDay(invoice.paidAt)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!paid ? (
            <>
              <SendWhatsAppButton invoiceId={invoice.id} number={invoice.number} />
              {invoice.status === "DRAFT" ? <MarkSentButton invoiceId={invoice.id} number={invoice.number} /> : null}
              <PayDialog invoiceId={invoice.id} number={invoice.number} total={total} trigger={<Button size="sm">Marcar pagada</Button>} />
            </>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a href={pdfUrl} target="_blank" rel="noopener">
              <FileText /> Ver PDF
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`${pdfUrl}?descargar`}>
              <Download /> Descargar
            </a>
          </Button>
          <CopyTextButton text={invoicePlainText(invoice, issuer)} />
          {!paid ? (
            <InvoiceEditorDialog
              contacts={contacts}
              invoice={{
                id: invoice.id,
                number: invoice.number,
                contactId: invoice.contactId,
                issueDate: invoice.issueDate.toISOString().slice(0, 10),
                dueDate: invoice.dueDate.toISOString().slice(0, 10),
                notes: invoice.notes,
                items: invoice.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil /> Editar
                </Button>
              }
            />
          ) : null}
          <DuplicateButton invoiceId={invoice.id} number={invoice.number} />
          {invoice.status === "DRAFT" ? (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" aria-label="Eliminar borrador">
                  <Trash2 />
                </Button>
              }
              description={<>¿Eliminar el borrador <strong>{invoice.number}</strong>?</>}
              confirmLabel="Eliminar"
              action={deleteInvoiceAndLeaveAction.bind(null, invoice.id)}
            />
          ) : null}
        </div>
      </div>

      <InvoiceDocument invoice={invoice} issuer={issuer} />
    </div>
  );
}
