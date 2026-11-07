"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, runAction } from "@/lib/action-result";
import {
  checkOverdueInvoices,
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  getLastInvoiceLines,
  markInvoicePaid,
  saveIssuer,
  sendInvoice,
  updateInvoice,
} from "@/lib/services/invoices";
import { getWhatsAppAccount } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { firstError, invoiceInputSchema, issuerSchema, payInvoiceSchema } from "@/lib/validation";

const id = z.string().min(1).max(64);

export async function saveInvoiceAction(invoiceId: string | null, raw: unknown) {
  await requireUser();
  const parsed = invoiceInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (invoiceId && !id.safeParse(invoiceId).success) return fail("Cuenta de cobro inválida");
  return runAction(async () => {
    const invoice = invoiceId ? await updateInvoice(invoiceId, parsed.data) : await createInvoice(parsed.data);
    return { id: invoice.id, number: invoice.number };
  });
}

export async function duplicateInvoiceAction(invoiceId: string) {
  if (!id.safeParse(invoiceId).success) return fail("Cuenta de cobro inválida");
  return runAction(async () => {
    const invoice = await duplicateInvoice(invoiceId);
    return { id: invoice.id, number: invoice.number };
  });
}

export async function deleteInvoiceAction(invoiceId: string) {
  if (!id.safeParse(invoiceId).success) return fail("Cuenta de cobro inválida");
  return runAction(() => deleteInvoice(invoiceId));
}

/** Delete from the document page, then go back to the list. */
export async function deleteInvoiceAndLeaveAction(invoiceId: string) {
  const result = await deleteInvoiceAction(invoiceId);
  if (result.ok) redirect("/cuentas-de-cobro");
  return result;
}

export async function sendInvoiceAction(invoiceId: string, channel: "whatsapp" | "manual") {
  if (!id.safeParse(invoiceId).success || !["whatsapp", "manual"].includes(channel)) return fail("Solicitud inválida");
  return runAction(async () => {
    await sendInvoice(invoiceId, channel);
    return { whatsappConnected: Boolean(await getWhatsAppAccount()) };
  });
}

export async function payInvoiceAction(raw: unknown) {
  await requireUser();
  const parsed = payInvoiceSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    await markInvoicePaid(parsed.data.invoiceId, parsed.data.paidAt);
  });
}

export async function checkOverdueAction() {
  return runAction(() => checkOverdueInvoices());
}

export async function saveIssuerAction(raw: unknown) {
  await requireUser();
  const parsed = issuerSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    await saveIssuer(parsed.data);
  });
}

/** Read-only helper for the editor ("copiar actividades de su última cuenta"). */
export async function lastInvoiceLinesAction(contactId: string) {
  if (!id.safeParse(contactId).success) return null;
  await requireUser();
  return getLastInvoiceLines(contactId);
}
