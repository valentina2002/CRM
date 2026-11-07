import type { InvoiceStatus, Stage } from "@/generated/prisma/enums";
import { OPEN_STAGES, STAGES } from "@/lib/constants";

export type InvoiceLike = {
  status: InvoiceStatus;
  paidAt: Date | null;
  items: { quantity: number; unitPrice: number }[];
};

/** Sum of quantity × unit price. */
export function invoiceTotal(invoice: Pick<InvoiceLike, "items">): number {
  return invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/** "YYYY-MM" of a moment in Bogotá. */
export function bogotaMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(date);
}

/** "YYYY-MM" of a calendar day stored as @db.Date (UTC midnight). */
export function dayMonth(day: Date): string {
  return day.toISOString().slice(0, 7);
}

export type DashboardInput = {
  contactCount: number;
  deals: { stage: Stage; value: number }[];
  invoices: InvoiceLike[];
  unread: number;
  now?: Date;
};

export function computeDashboard({ contactCount, deals, invoices, unread, now = new Date() }: DashboardInput) {
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const month = bogotaMonth(now);
  const paidThisMonth = invoices.filter((i) => i.status === "PAID" && i.paidAt && dayMonth(i.paidAt) === month);
  const receivable = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE");
  const byStage = STAGES.map((s) => {
    const inStage = deals.filter((d) => d.stage === s.value);
    return { stage: s.value, label: s.label, count: inStage.length, value: inStage.reduce((a, d) => a + d.value, 0) };
  });

  return {
    contacts: contactCount,
    activeClients: deals.filter((d) => d.stage === "ACTIVE_CLIENT").length,
    pipelineOpen: open.reduce((a, d) => a + d.value, 0),
    pipelineOpenCount: open.length,
    collectedThisMonth: paidThisMonth.reduce((a, i) => a + invoiceTotal(i), 0),
    collectedThisMonthCount: paidThisMonth.length,
    receivable: receivable.reduce((a, i) => a + invoiceTotal(i), 0),
    overdueCount: invoices.filter((i) => i.status === "OVERDUE").length,
    unread,
    byStage,
    maxStageValue: Math.max(1, ...byStage.map((b) => b.value)),
  };
}
