import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { originSummary, RATE_LIMIT, RATE_WINDOW_MS, type LeadSubmission, type Utm } from "@/lib/lead-form";
import { normalizeTags } from "@/lib/validation";
import { createContact } from "./contacts";
import { DomainError, logActivity } from "./core";
import { getIssuer } from "./invoices";

export type LeadFormInput = { name: string; tags: string[]; service: string | null; successMessage: string; redirectUrl: string | null };

const newPublicId = () => randomBytes(9).toString("base64url");

export async function listLeadForms() {
  return db.leadForm.findMany({
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, contactId: true, isNew: true, createdAt: true } } },
  });
}

export async function createLeadForm(input: LeadFormInput) {
  return db.$transaction(async (tx) => {
    const form = await tx.leadForm.create({ data: { ...input, tags: normalizeTags(input.tags), publicId: newPublicId() } });
    await logActivity(tx, { type: "form.created", text: `Formulario creado: ${form.name}` });
    return form;
  });
}

export async function updateLeadForm(id: string, input: LeadFormInput) {
  const form = await db.leadForm.findUnique({ where: { id } });
  if (!form) throw new DomainError("Formulario no encontrado", "not_found");
  return db.leadForm.update({ where: { id }, data: { ...input, tags: normalizeTags(input.tags) } });
}

export async function setLeadFormActive(id: string, active: boolean) {
  const form = await db.leadForm.findUnique({ where: { id } });
  if (!form) throw new DomainError("Formulario no encontrado", "not_found");
  await db.leadForm.update({ where: { id }, data: { active } });
}

export async function deleteLeadForm(id: string) {
  const form = await db.leadForm.findUnique({ where: { id } });
  if (!form) throw new DomainError("Formulario no encontrado", "not_found");
  await db.$transaction(async (tx) => {
    await tx.leadForm.delete({ where: { id } });
    await logActivity(tx, { type: "form.deleted", text: `Formulario eliminado: ${form.name}` });
  });
}

/** What the public page needs (only active forms). */
export async function getPublicForm(publicId: string) {
  if (!/^[\w-]{6,32}$/.test(publicId)) return null;
  const [form, issuer] = await Promise.all([
    db.leadForm.findUnique({ where: { publicId }, select: { id: true, publicId: true, name: true, successMessage: true, redirectUrl: true, active: true } }),
    getIssuer(),
  ]);
  return form?.active ? { ...form, ownerName: issuer.name } : null;
}

/**
 * Stores a submission: a NEW contact (source "form", the form's tags and service, emits contact.created so the
 * welcome automation runs) or, when the WhatsApp number or email already exists, a note + history line on that
 * contact (no duplicate). The origin (form, page, UTM) and the data consent go into a note.
 */
export async function submitLead(publicId: string, lead: LeadSubmission, meta: { ipHash: string; pageUrl: string | null; utm: Utm }) {
  const form = await db.leadForm.findUnique({ where: { publicId } });
  if (!form?.active) throw new DomainError("Este formulario ya no está disponible", "not_found");

  const recent = await db.leadSubmission.count({ where: { ipHash: meta.ipHash, createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) } } });
  if (recent >= RATE_LIMIT) throw new DomainError("Recibimos varios mensajes seguidos desde tu conexión. Intenta de nuevo en unos minutos.", "conflict");

  const existing = lead.phone
    ? await db.contact.findUnique({ where: { phone: lead.phone } })
    : lead.email
      ? await db.contact.findFirst({ where: { email: { equals: lead.email, mode: "insensitive" } }, orderBy: { createdAt: "asc" } })
      : null;

  const origin = originSummary(form.name, meta.pageUrl, meta.utm);
  const noteBody = [lead.message ? `Mensaje: ${lead.message}` : null, origin, "Autorizó el tratamiento de sus datos (Ley 1581 de 2012)."].filter(Boolean).join("\n");
  let contactId: string;
  let isNew: boolean;

  if (existing) {
    isNew = false;
    contactId = existing.id;
    await db.$transaction(async (tx) => {
      const known = new Set(existing.tags.map((t) => t.toLocaleLowerCase("es-CO")));
      const tags = [...existing.tags, ...form.tags.filter((t) => !known.has(t.toLocaleLowerCase("es-CO")))];
      await tx.contact.update({
        where: { id: existing.id },
        data: { tags, company: existing.company ?? lead.company, email: existing.email ?? lead.email, phone: existing.phone ?? lead.phone },
      });
      await tx.note.create({ data: { contactId: existing.id, body: noteBody } });
      await logActivity(tx, { type: "form.submitted", text: `Volvió a escribir por el formulario “${form.name}”`, contactId: existing.id, data: { formId: form.id } });
    });
  } else {
    isNew = true;
    const contact = await createContact(
      { name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, service: (form.service as never) ?? null, monthlyValue: 0, tags: normalizeTags([...form.tags]) },
      "form",
    );
    contactId = contact.id;
    await db.$transaction(async (tx) => {
      await tx.note.create({ data: { contactId: contact.id, body: noteBody } });
      await logActivity(tx, { type: "form.submitted", text: `Llegó por el formulario “${form.name}”`, contactId: contact.id, data: { formId: form.id } });
    });
  }

  await db.$transaction([
    db.leadSubmission.create({ data: { formId: form.id, contactId, ipHash: meta.ipHash, pageUrl: meta.pageUrl, utm: meta.utm as Prisma.InputJsonObject, isNew } }),
    db.leadForm.update({ where: { id: form.id }, data: { submissions: { increment: 1 } } }),
  ]);
  return { contactId, isNew, successMessage: form.successMessage, redirectUrl: form.redirectUrl };
}
