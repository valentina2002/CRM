import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckOverdueButton, InvoiceRowActions } from "@/components/invoices/invoice-actions";
import { InvoiceEditorDialog } from "@/components/invoices/invoice-editor-dialog";
import { IssuerDialog } from "@/components/invoices/issuer-dialog";
import { InvoiceStatusChip } from "@/components/invoices/status-chip";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { invoiceTotal } from "@/lib/dashboard";
import { formatCOP, formatDay } from "@/lib/format";
import { listContactOptions } from "@/lib/services/contacts";
import { getIssuer, listInvoices } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Cuentas de cobro" };

export default function CuentasDeCobroPage() {
  return (
    <Suspense fallback={<PageSkeleton title="Cuentas de cobro" />}>
      <Invoices />
    </Suspense>
  );
}

const toDay = (d: Date) => d.toISOString().slice(0, 10);

async function Invoices() {
  await requireUser();
  const [invoices, contacts, issuer] = await Promise.all([listInvoices(), listContactOptions(), getIssuer()]);

  const summary = (status: InvoiceStatus) => {
    const list = invoices.filter((i) => i.status === status);
    return { count: list.length, total: list.reduce((s, i) => s + invoiceTotal(i), 0) };
  };

  return (
    <>
      <PageHeader
        title="Cuentas de cobro"
        subtitle="Crea, envía por WhatsApp y registra el pago de tus cuentas de cobro mensuales."
        actions={
          <>
            <IssuerDialog issuer={issuer} trigger={<Button variant="outline">Datos del emisor</Button>} />
            <CheckOverdueButton />
            <InvoiceEditorDialog contacts={contacts} trigger={<Button>+ Nueva cuenta de cobro</Button>} />
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        {(["DRAFT", "SENT", "PAID", "OVERDUE"] as const).map((s) => {
          const { count, total } = summary(s);
          return (
            <div key={s} className="rounded-[10px] border bg-card p-[18px]">
              <InvoiceStatusChip status={s} />
              <div className="mt-1 text-[22px] font-bold tracking-[-.01em] tabular-nums">{formatCOP(total)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {count} cuenta{count === 1 ? "" : "s"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-[10px] border bg-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b bg-[#fafbfc] text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">Número</th>
              <th className="px-3 py-2.5 font-semibold">Cliente</th>
              <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Emisión</th>
              <th className="px-3 py-2.5 font-semibold">Vence</th>
              <th className="px-3 py-2.5 font-semibold">Valor</th>
              <th className="px-3 py-2.5 font-semibold">Estado</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Todavía no hay cuentas de cobro.
                </td>
              </tr>
            ) : (
              invoices.map((i) => {
                const total = invoiceTotal(i);
                return (
                  <tr key={i.id} className="border-b last:border-b-0 hover:bg-[#fafbfc]">
                    <td className="px-3 py-[11px] font-semibold whitespace-nowrap">
                      <Link href={`/cuentas-de-cobro/${i.id}`} className="hover:text-primary hover:underline">
                        {i.number}
                      </Link>
                    </td>
                    <td className="px-3 py-[11px]">
                      <Link href={`/contactos/${i.contact.id}`} className="hover:text-primary hover:underline">
                        {i.contact.name}
                      </Link>
                      <div className="text-[12.5px] text-muted-foreground">{i.contact.company}</div>
                    </td>
                    <td className="hidden px-3 py-[11px] whitespace-nowrap md:table-cell">{formatDay(i.issueDate)}</td>
                    <td className="px-3 py-[11px] whitespace-nowrap">{formatDay(i.dueDate)}</td>
                    <td className="px-3 py-[11px] tabular-nums whitespace-nowrap">{formatCOP(total)}</td>
                    <td className="px-3 py-[11px]">
                      <InvoiceStatusChip status={i.status} />
                      {i.status === "PAID" && i.paidAt ? <div className="mt-0.5 text-[11.5px] text-muted-foreground">{formatDay(i.paidAt)}</div> : null}
                    </td>
                    <td className="px-3 py-[11px] text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/cuentas-de-cobro/${i.id}`}>Ver</Link>
                        </Button>
                        <InvoiceRowActions
                          status={i.status}
                          total={total}
                          contacts={contacts}
                          invoice={{
                            id: i.id,
                            number: i.number,
                            contactId: i.contactId,
                            issueDate: toDay(i.issueDate),
                            dueDate: toDay(i.dueDate),
                            notes: i.notes,
                            items: i.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
