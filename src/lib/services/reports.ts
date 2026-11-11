import "server-only";
import { db } from "@/lib/db";
import { computeReport } from "@/lib/reports";

/** Loads what the report needs for the last `periodDays` and computes it (src/lib/reports.ts). */
export async function getReport(periodDays: number, now: Date = new Date()) {
  const since = new Date(now.getTime() - periodDays * 86_400_000);
  const sixMonthsAgo = new Date(now.getTime() - 200 * 86_400_000);
  const [contacts, deals, invoices, messages] = await Promise.all([
    db.contact.findMany({ where: { createdAt: { gte: since } }, select: { id: true, source: true, service: true, createdAt: true, deals: { select: { stage: true } } } }),
    db.deal.findMany({ select: { stage: true, updatedAt: true } }),
    db.invoice.findMany({
      where: { OR: [{ status: { in: ["SENT", "OVERDUE"] } }, { status: "PAID", paidAt: { gte: sixMonthsAgo < since ? sixMonthsAgo : since } }] },
      select: { status: true, dueDate: true, paidAt: true, contact: { select: { id: true, name: true, service: true } }, items: { select: { quantity: true, unitPrice: true } } },
    }),
    db.message.findMany({
      where: { sentAt: { gte: since } },
      select: { conversationId: true, direction: true, via: true, sentAt: true },
      orderBy: { sentAt: "asc" },
      take: 20_000,
    }),
  ]);
  return computeReport({
    now,
    periodDays,
    contacts: contacts.map((c) => ({ id: c.id, source: c.source, service: c.service, createdAt: c.createdAt, stages: c.deals.map((d) => d.stage) })),
    deals,
    invoices,
    messages,
  });
}
