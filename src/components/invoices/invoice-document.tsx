import { invoiceTotal } from "@/lib/dashboard";
import { formatCOP, formatDay } from "@/lib/format";
import { amountInWordsCOP } from "@/lib/number-words";
import type { InvoiceWithDetails } from "@/lib/services/invoices";

export type IssuerData = { name: string; document: string; city: string; paymentInfo: string; showAmountInWords: boolean };

/** On-screen cuenta de cobro (same layout as the PDF and the prototype's `docHtml`). */
export function InvoiceDocument({ invoice, issuer }: { invoice: InvoiceWithDetails; issuer: IssuerData }) {
  const total = invoiceTotal(invoice);
  return (
    <article className="mx-auto max-w-[760px] rounded-lg border bg-white px-6 py-7 text-[14px] sm:px-[30px]">
      <h2 className="mb-1 text-center text-lg font-bold tracking-[.04em]">CUENTA DE COBRO N.º {invoice.number}</h2>
      <div className="mb-5 text-center text-muted-foreground">
        {issuer.city}, {formatDay(invoice.issueDate)}
      </div>

      <p>
        <strong>{invoice.contact.company || invoice.contact.name}</strong>
        {invoice.contact.company ? (
          <>
            <br />
            <span className="text-muted-foreground">Atención: {invoice.contact.name}</span>
          </>
        ) : null}
      </p>

      <p className="mt-4 mb-1">DEBE A:</p>
      <p>
        <strong>{issuer.name}</strong>
        <br />
        {issuer.document}
      </p>

      <p className="my-4">
        La suma de <strong>{formatCOP(total)}</strong>
        {issuer.showAmountInWords ? <> ({amountInWordsCOP(total)})</> : null} por concepto de las siguientes actividades:
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b bg-[#fafbfc] text-xs text-muted-foreground">
              <th className="px-2 py-[7px] font-semibold">Actividad</th>
              <th className="px-2 py-[7px] text-right font-semibold">Cant.</th>
              <th className="px-2 py-[7px] text-right font-semibold">Valor unit.</th>
              <th className="px-2 py-[7px] text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="px-2 py-[7px]">{it.description}</td>
                <td className="px-2 py-[7px] text-right tabular-nums">{it.quantity}</td>
                <td className="px-2 py-[7px] text-right tabular-nums whitespace-nowrap">{formatCOP(it.unitPrice)}</td>
                <td className="px-2 py-[7px] text-right tabular-nums whitespace-nowrap">{formatCOP(it.quantity * it.unitPrice)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="px-2 py-[7px] text-right font-bold">
                TOTAL
              </td>
              <td className="px-2 py-[7px] text-right font-bold tabular-nums whitespace-nowrap">{formatCOP(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {invoice.notes ? <p className="mt-4 text-[13px] whitespace-pre-wrap">{invoice.notes}</p> : null}

      <p className="mt-4 text-[12.5px] whitespace-pre-wrap">
        Fecha límite de pago: {formatDay(invoice.dueDate)}
        {issuer.paymentInfo ? `\n${issuer.paymentInfo}` : ""}
      </p>

      <p className="mt-9">
        _____________________________
        <br />
        {issuer.name}
        <br />
        <span className="text-[12.5px] text-muted-foreground">{issuer.document}</span>
      </p>
    </article>
  );
}

/** Plain-text version ("Copiar texto"), like the prototype's `docText`. */
export function invoicePlainText(invoice: InvoiceWithDetails, issuer: IssuerData): string {
  const total = invoiceTotal(invoice);
  return [
    `CUENTA DE COBRO N.º ${invoice.number}`,
    `${issuer.city}, ${formatDay(invoice.issueDate)}`,
    "",
    invoice.contact.company || invoice.contact.name,
    "",
    "DEBE A:",
    issuer.name,
    issuer.document,
    "",
    `La suma de ${formatCOP(total)}${issuer.showAmountInWords ? ` (${amountInWordsCOP(total)})` : ""} por concepto de:`,
    ...invoice.items.map((it) => `- ${it.description} (x${it.quantity}): ${formatCOP(it.quantity * it.unitPrice)}`),
    "",
    `TOTAL: ${formatCOP(total)}`,
    `Fecha límite de pago: ${formatDay(invoice.dueDate)}`,
    issuer.paymentInfo,
    ...(invoice.notes ? ["", invoice.notes] : []),
    "",
    issuer.name,
    issuer.document,
  ].join("\n");
}
