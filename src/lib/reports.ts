import type { Stage } from "@/generated/prisma/enums";
import { CONTACT_SOURCE_LABEL } from "@/lib/constants";
import { addDaysISO, todayISO } from "@/lib/format";
import { bogotaMonth, dayMonth, invoiceTotal } from "@/lib/dashboard";

// Pure report calculations (src/lib/reports.test.ts). The DB queries live in src/lib/services/reports.ts.

export const PERIODS = { "30": "Últimos 30 días", "90": "Últimos 90 días", "365": "Último año" } as const;
export type PeriodKey = keyof typeof PERIODS;
export const periodKey = (raw: unknown): PeriodKey => (raw === "30" || raw === "365" ? raw : "90");

export type ReportInput = {
  now?: Date;
  /** Contacts created in the period, with their deals' stages. */
  contacts: { id: string; source: string | null; service: string | null; createdAt: Date; stages: Stage[] }[];
  /** All deals (closing rate counts deals decided in the period by updatedAt). */
  deals: { stage: Stage; updatedAt: Date }[];
  invoices: { status: "DRAFT" | "SENT" | "PAID" | "OVERDUE"; dueDate: Date; paidAt: Date | null; contact: { id: string; name: string; service: string | null }; items: { quantity: number; unitPrice: number }[] }[];
  /** Messages of the period, oldest first per conversation (for response time). */
  messages: { conversationId: string; direction: "IN" | "OUT"; via: string | null; sentAt: Date }[];
  periodDays: number;
};

const SOURCE_FALLBACK = "Otro";
export const sourceLabel = (source: string | null) => (source === "app_sync" ? "Contactos de la app" : (CONTACT_SOURCE_LABEL[source ?? ""] ?? (source ? source : SOURCE_FALLBACK)));

/** Median of a list of numbers (null when empty). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * First human reply time per customer message burst: from the first unanswered inbound message to the next
 * outgoing message written by a person (CRM or phone app; automations and imported history don't count).
 */
export function responseTimesMinutes(messages: ReportInput["messages"]): number[] {
  const byConversation = new Map<string, ReportInput["messages"]>();
  for (const m of messages) byConversation.set(m.conversationId, [...(byConversation.get(m.conversationId) ?? []), m]);
  const out: number[] = [];
  for (const list of byConversation.values()) {
    let waitingSince: Date | null = null;
    for (const m of [...list].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) {
      if (m.via === "HISTORY") continue;
      if (m.direction === "IN") waitingSince ??= m.sentAt;
      else if (waitingSince && (m.via === "CRM" || m.via === "APP")) {
        out.push((m.sentAt.getTime() - waitingSince.getTime()) / 60_000);
        waitingSince = null;
      }
    }
  }
  return out;
}

/** Last N calendar months in Bogotá, oldest first ("2026-06" … "2026-11"). */
export function lastMonths(n: number, now: Date): string[] {
  const [y, m] = bogotaMonth(now).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const monthLabel = (ym: string) => `${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export const AGING_BUCKETS = [
  { key: "current", label: "Aún no vence" },
  { key: "1-30", label: "1 a 30 días vencida" },
  { key: "31-60", label: "31 a 60 días" },
  { key: "61-90", label: "61 a 90 días" },
  { key: "90+", label: "Más de 90 días" },
] as const;

export function computeReport({ now = new Date(), contacts, deals, invoices, messages, periodDays }: ReportInput) {
  const today = todayISO(now);
  const since = new Date(now.getTime() - periodDays * 86_400_000);

  // --- origin of contacts and how many became clients
  const bySource = new Map<string, { label: string; contacts: number; clients: number }>();
  for (const c of contacts) {
    const label = sourceLabel(c.source);
    const row = bySource.get(label) ?? { label, contacts: 0, clients: 0 };
    row.contacts++;
    if (c.stages.includes("ACTIVE_CLIENT")) row.clients++;
    bySource.set(label, row);
  }
  const sources = [...bySource.values()].sort((a, b) => b.contacts - a.contacts || a.label.localeCompare(b.label, "es-CO"));
  const newContacts = contacts.length;
  const newClients = contacts.filter((c) => c.stages.includes("ACTIVE_CLIENT")).length;

  // --- closing rate: deals decided (won or lost) in the period
  const decided = deals.filter((d) => (d.stage === "ACTIVE_CLIENT" || d.stage === "LOST") && d.updatedAt >= since);
  const won = decided.filter((d) => d.stage === "ACTIVE_CLIENT").length;
  const closeRate = decided.length ? won / decided.length : null;

  // --- collected per month (last 6) and per service / client in the period
  const months = lastMonths(6, now);
  const paid = invoices.filter((i) => i.status === "PAID" && i.paidAt);
  const collectedByMonth = months.map((ym) => ({ month: ym, label: monthLabel(ym), total: paid.filter((i) => dayMonth(i.paidAt!) === ym).reduce((a, i) => a + invoiceTotal(i), 0) }));
  const paidInPeriod = paid.filter((i) => i.paidAt!.toISOString().slice(0, 10) >= addDaysISO(today, -periodDays));
  const sumBy = (key: (i: (typeof paid)[number]) => string) => {
    const map = new Map<string, number>();
    for (const i of paidInPeriod) map.set(key(i), (map.get(key(i)) ?? 0) + invoiceTotal(i));
    return [...map.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  };
  const collectedInPeriod = paidInPeriod.reduce((a, i) => a + invoiceTotal(i), 0);
  const byService = sumBy((i) => i.contact.service ?? "Sin servicio");
  const byClient = sumBy((i) => i.contact.name).slice(0, 5);

  // --- receivables by age (pending and overdue)
  const aging = AGING_BUCKETS.map((b) => ({ ...b, total: 0, count: 0 }));
  for (const i of invoices.filter((x) => x.status === "SENT" || x.status === "OVERDUE")) {
    const due = i.dueDate.toISOString().slice(0, 10);
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
    const key = days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    const bucket = aging.find((b) => b.key === key)!;
    bucket.total += invoiceTotal(i);
    bucket.count++;
  }

  // --- response time
  const times = responseTimesMinutes(messages);

  return {
    newContacts,
    newClients,
    sources,
    closeRate,
    decided: decided.length,
    won,
    collectedByMonth,
    collectedInPeriod,
    byService,
    byClient,
    aging,
    receivable: aging.reduce((a, b) => a + b.total, 0),
    responseMedianMinutes: median(times),
    responseCount: times.length,
  };
}

/** "45 min", "3 h 20 min", "2 días". */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(minutes / 1440)} días`;
}
