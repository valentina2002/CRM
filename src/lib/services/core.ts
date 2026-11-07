import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

/** Error with a Spanish message that is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "conflict" | "invalid" = "invalid",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type EventType =
  | "contact.created"
  | "message.received"
  | "message.sent"
  | "deal.stage_changed"
  | "invoice.paid"
  | "invoice.overdue";

/**
 * Records a domain event (row in `Event`, status pending). The Phase 3 processor runs matching
 * automations and outgoing webhooks. Actions executed BY automations must not call emit()
 * (no infinite chains).
 */
export async function emit(tx: Tx, type: EventType, payload: Prisma.InputJsonObject) {
  return tx.event.create({ data: { type, payload } });
}

/** Adds a line to the activity feed; with contactId it also appears in that contact's history. */
export async function logActivity(
  tx: Tx,
  entry: { text: string; type?: string; contactId?: string | null; data?: Prisma.InputJsonObject },
) {
  return tx.activityLog.create({
    data: { text: entry.text, type: entry.type ?? "info", contactId: entry.contactId ?? null, data: entry.data },
  });
}

/** Prisma unique-constraint error on the given field. */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") return false;
  const meta = (error as { meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } }).meta;
  const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(target) ? target.some((t) => String(t).includes(field)) : String(target ?? "").includes(field);
}
