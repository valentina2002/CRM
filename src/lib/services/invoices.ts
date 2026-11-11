import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { invoiceTotal } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { addDaysISO, firstName, formatCOP, formatDay, isoToDbDate, todayISO } from "@/lib/format";
import type { InvoiceInput, IssuerInput } from "@/lib/validation";
import { invoiceFileName } from "@/lib/invoice-pdf";
import { DomainError, emit, isUniqueViolation, logActivity, type Tx } from "./core";

export const DEFAULT_ISSUER = {
  id: 1,
  name: "Valentina",
  document: "C.C. ________",
  city: "Medellín",
  paymentInfo: "Banco: ________ · Cuenta de ahorros N.º ________",
  showAmountInWords: true,
};

const withContactAndItems = {
  contact: { select: { id: true, name: true, company: true, phone: true } },
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{ include: typeof withContactAndItems }>;

/** "CC-007": highest existing number + 1 (3 digits minimum, grows past 999). */
export async function nextInvoiceNumber(tx: Tx = db): Promise<string> {
  const rows = await tx.invoice.findMany({ select: { number: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.number.replace(/\D/g, "")) || 0), 0);
  return `CC-${String(max + 1).padStart(3, "0")}`;
}

const itemsData = (items: InvoiceInput["items"]) =>
  items.map((it, position) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, position }));

async function ensureContact(contactId: string) {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true } });
  if (!contact) throw new DomainError("Cliente no encontrado", "not_found");
  return contact;
}

/** Creates a draft (retries the number if two are created at the same time). */
export async function createInvoice(input: InvoiceInput, activityText?: (n: string) => string) {
  const contact = await ensureContact(input.contactId);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const number = await nextInvoiceNumber(tx);
        const invoice = await tx.invoice.create({
          data: {
            number,
            contactId: input.contactId,
            issueDate: isoToDbDate(input.issueDate),
            dueDate: isoToDbDate(input.dueDate),
            notes: input.notes,
            items: { create: itemsData(input.items) },
          },
          include: { items: true },
        });
        await logActivity(tx, {
          type: "invoice.created",
          text: activityText ? activityText(number) : `Cuenta de cobro ${number} creada para ${contact.name} (${formatCOP(invoiceTotal(invoice))})`,
          contactId: input.contactId,
          data: { invoiceId: invoice.id, number },
        });
        return invoice;
      });
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error, "number")) continue;
      throw error;
    }
  }
  throw new DomainError("No se pudo asignar el número de la cuenta de cobro. Intenta de nuevo.");
}

export async function updateInvoice(id: string, input: InvoiceInput) {
  const before = await db.invoice.findUnique({ where: { id } });
  if (!before) throw new DomainError("Cuenta de cobro no encontrada", "not_found");
  if (before.status === "PAID") throw new DomainError("Una cuenta de cobro pagada no se puede editar. Duplícala si necesitas otra.", "conflict");
  await ensureContact(input.contactId);

  // An overdue invoice whose due date moves to today or later becomes pending again.
  const status = before.status === "OVERDUE" && input.dueDate >= todayISO() ? "SENT" : before.status;
  return db.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        contactId: input.contactId,
        issueDate: isoToDbDate(input.issueDate),
        dueDate: isoToDbDate(input.dueDate),
        notes: input.notes,
        status,
        items: { create: itemsData(input.items) },
      },
      include: { items: true },
    });
    await logActivity(tx, {
      type: "invoice.updated",
      text: `Cuenta de cobro ${invoice.number} editada (${formatCOP(invoiceTotal(invoice))})`,
      contactId: invoice.contactId,
      data: { invoiceId: id },
    });
    return invoice;
  });
}

export async function deleteInvoice(id: string) {
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) throw new DomainError("Cuenta de cobro no encontrada", "not_found");
  if (invoice.status !== "DRAFT") {
    throw new DomainError("Solo se pueden eliminar borradores. Las cuentas enviadas o pagadas quedan como registro.", "conflict");
  }
  await db.$transaction(async (tx) => {
    await tx.invoice.delete({ where: { id } });
    await logActivity(tx, { type: "invoice.deleted", text: `Borrador ${invoice.number} eliminado`, contactId: invoice.contactId });
  });
}

/**
 * Monthly recurring billing: copies client + activities into a new draft dated today, keeping the
 * same number of days to pay as the original.
 */
export async function duplicateInvoice(id: string) {
  const source = await db.invoice.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
  if (!source) throw new DomainError("Cuenta de cobro no encontrada", "not_found");
  const days = Math.max(0, Math.round((source.dueDate.getTime() - source.issueDate.getTime()) / 86_400_000)) || 15;
  const issueDate = todayISO();
  return createInvoice(
    {
      contactId: source.contactId,
      issueDate,
      dueDate: addDaysISO(issueDate, days),
      notes: source.notes,
      items: source.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
    },
    (number) => `Cuenta de cobro ${number} creada duplicando ${source.number}`,
  );
}

/** Latest invoice of a client, to copy its activities into a new one. */
export async function getLastInvoiceLines(contactId: string) {
  return db.invoice.findFirst({
    where: { contactId },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    select: { number: true, items: { orderBy: { position: "asc" }, select: { description: true, quantity: true, unitPrice: true } } },
  });
}

export async function getIssuer() {
  return (await db.issuerSettings.findUnique({ where: { id: 1 } })) ?? DEFAULT_ISSUER;
}

export async function saveIssuer(input: IssuerInput) {
  return db.issuerSettings.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
}

/** WhatsApp text sent with the cuenta de cobro (same wording as the prototype). */
export function invoiceMessage(invoice: InvoiceWithDetails, paymentInfo: string) {
  const name = firstName(invoice.contact.name);
  return (
    `Hola ${name}, te comparto la cuenta de cobro ${invoice.number} por ${formatCOP(invoiceTotal(invoice))}, ` +
    `con fecha límite de pago ${formatDay(invoice.dueDate)}.` +
    (paymentInfo.trim() ? `\n\n${paymentInfo.trim()}` : "")
  );
}

/**
 * Sends (or marks as sent) a cuenta de cobro. DRAFT → SENT. With `whatsapp`, the message is saved in
 * the client's conversation as QUEUED (text + PDF document); the outbox sends them through the Cloud API.
 */
export async function sendInvoice(id: string, channel: "whatsapp" | "manual") {
  const invoice = await db.invoice.findUnique({ where: { id }, include: withContactAndItems });
  if (!invoice) throw new DomainError("Cuenta de cobro no encontrada", "not_found");
  if (invoice.status === "PAID") throw new DomainError("Esta cuenta de cobro ya está pagada", "conflict");
  if (channel === "whatsapp" && !invoice.contact.phone) {
    throw new DomainError(`${invoice.contact.name} no tiene número de WhatsApp. Agrégalo en su ficha.`, "invalid");
  }
  const issuer = await getIssuer();

  return db.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: invoice.status === "DRAFT" ? "SENT" : invoice.status, sentAt: invoice.sentAt ?? new Date() },
    });
    if (channel === "whatsapp") {
      const now = new Date();
      const conversation = await tx.conversation.upsert({
        where: { contactId: invoice.contactId },
        update: { lastMessageAt: now, lastChannel: "WHATSAPP" },
        create: { contactId: invoice.contactId, lastMessageAt: now, lastChannel: "WHATSAPP" },
      });
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          channel: "WHATSAPP",
          direction: "OUT",
          via: "CRM",
          type: "text",
          body: invoiceMessage(invoice, issuer.paymentInfo),
          status: "QUEUED",
          sentAt: now,
        },
      });
      // The PDF goes as a WhatsApp document right after the text (rendered and uploaded by the outbox).
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          channel: "WHATSAPP",
          direction: "OUT",
          via: "CRM",
          type: "document",
          body: `📄 ${invoiceFileName(invoice)}`,
          meta: { invoiceId: invoice.id },
          status: "QUEUED",
          sentAt: new Date(now.getTime() + 1),
        },
      });
    }
    await logActivity(tx, {
      type: "invoice.sent",
      text:
        channel === "whatsapp"
          ? `Cuenta de cobro ${invoice.number} enviada por WhatsApp a ${invoice.contact.name}`
          : `Cuenta de cobro ${invoice.number} marcada como enviada`,
      contactId: invoice.contactId,
      data: { invoiceId: id, channel },
    });
    return updated;
  });
}

/** Marks a cuenta de cobro as paid on the given day and emits `invoice.paid`. */
export async function markInvoicePaid(id: string, paidAtISO: string) {
  const invoice = await db.invoice.findUnique({ where: { id }, include: withContactAndItems });
  if (!invoice) throw new DomainError("Cuenta de cobro no encontrada", "not_found");
  if (invoice.status === "PAID") throw new DomainError("Ya estaba pagada", "conflict");
  if (paidAtISO > todayISO()) throw new DomainError("La fecha de pago no puede ser futura");
  const total = invoiceTotal(invoice);

  return db.$transaction(async (tx) => {
    const updated = await tx.invoice.update({ where: { id }, data: { status: "PAID", paidAt: isoToDbDate(paidAtISO) } });
    await logActivity(tx, {
      type: "invoice.paid",
      text: `Cuenta de cobro ${invoice.number} pagada (${formatCOP(total)}) el ${formatDay(paidAtISO)}`,
      contactId: invoice.contactId,
      data: { invoiceId: id },
    });
    await emit(tx, "invoice.paid", { invoiceId: id, contactId: invoice.contactId, number: invoice.number, total, paidAt: paidAtISO });
    return updated;
  });
}

/**
 * Daily job: pending (SENT) invoices whose due date is before today (Bogotá) become OVERDUE and emit
 * `invoice.overdue`. Idempotent: running it twice the same day changes nothing the second time.
 */
export async function checkOverdueInvoices(today: string = todayISO()) {
  const due = await db.invoice.findMany({
    where: { status: "SENT", dueDate: { lt: isoToDbDate(today) } },
    include: withContactAndItems,
  });
  for (const invoice of due) {
    await db.$transaction(async (tx) => {
      // Re-check inside the transaction so concurrent runs don't double-emit.
      const { count } = await tx.invoice.updateMany({ where: { id: invoice.id, status: "SENT" }, data: { status: "OVERDUE" } });
      if (!count) return;
      const total = invoiceTotal(invoice);
      await logActivity(tx, {
        type: "invoice.overdue",
        text: `Cuenta de cobro ${invoice.number} vencida (${formatCOP(total)})`,
        contactId: invoice.contactId,
        data: { invoiceId: invoice.id },
      });
      await emit(tx, "invoice.overdue", { invoiceId: invoice.id, contactId: invoice.contactId, number: invoice.number, total });
    });
  }
  return due.map((i) => i.number);
}

export async function listInvoices(filter: { status?: InvoiceStatus; contactId?: string } = {}) {
  return db.invoice.findMany({
    where: { ...(filter.status ? { status: filter.status } : {}), ...(filter.contactId ? { contactId: filter.contactId } : {}) },
    include: withContactAndItems,
    orderBy: { number: "desc" },
  });
}

export async function getInvoice(id: string) {
  return db.invoice.findUnique({ where: { id }, include: withContactAndItems });
}
