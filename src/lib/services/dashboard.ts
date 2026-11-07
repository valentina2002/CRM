import "server-only";
import { computeDashboard } from "@/lib/dashboard";
import { db } from "@/lib/db";

export async function getDashboard() {
  const [contactCount, deals, invoices, unread, tasks, activity] = await Promise.all([
    db.contact.count(),
    db.deal.findMany({ select: { stage: true, value: true } }),
    db.invoice.findMany({
      where: { status: { not: "DRAFT" } },
      select: { status: true, paidAt: true, items: { select: { quantity: true, unitPrice: true } } },
    }),
    db.conversation.aggregate({ _sum: { unread: true } }),
    db.task.findMany({
      // Pending first (oldest due first), then the most recently created done ones.
      orderBy: [{ done: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 8,
      include: { contact: { select: { id: true, name: true } } },
    }),
    db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { contact: { select: { id: true } } } }),
  ]);
  const pendingTasks = await db.task.count({ where: { done: false } });

  return {
    kpis: computeDashboard({ contactCount, deals, invoices, unread: unread._sum.unread ?? 0 }),
    tasks,
    pendingTasks,
    activity,
  };
}
