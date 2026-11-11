import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatCOP, formatPhone } from "@/lib/format";
import type { ContactInput } from "@/lib/validation";
import { DomainError, emit, isUniqueViolation, logActivity, type Tx } from "./core";

const FIELD_LABEL: Record<string, string> = {
  name: "nombre",
  company: "empresa",
  phone: "WhatsApp",
  email: "correo",
  service: "servicio",
  monthlyValue: "valor mensual",
};

async function ensureNoPhoneDuplicate(phone: string | null, exceptId?: string) {
  if (!phone) return;
  const existing = await db.contact.findUnique({ where: { phone }, select: { id: true, name: true } });
  if (existing && existing.id !== exceptId) {
    throw new DomainError(`Ya existe un contacto con ese WhatsApp: ${existing.name}`, "conflict");
  }
}

async function syncWhatsAppIdentity(tx: Tx, contactId: string, phone: string | null) {
  await tx.contactChannel.deleteMany({ where: { contactId, channel: "WHATSAPP" } });
  if (phone) await tx.contactChannel.create({ data: { contactId, channel: "WHATSAPP", externalId: phone.slice(1) } });
}

/**
 * Creates a contact + its "Prospecto" deal + its (empty) conversation, logs it and emits
 * `contact.created` — same behavior as createContact() in the prototype.
 */
export async function createContact(input: ContactInput, source = "manual") {
  await ensureNoPhoneDuplicate(input.phone);
  try {
    return await db.$transaction(async (tx) => {
      const contact = await tx.contact.create({ data: { ...input, source } });
      await syncWhatsAppIdentity(tx, contact.id, contact.phone);
      await tx.deal.create({
        data: { contactId: contact.id, title: contact.service ?? "Nueva oportunidad", stage: "PROSPECT", value: contact.monthlyValue },
      });
      await tx.conversation.create({ data: { contactId: contact.id } });
      await logActivity(tx, { type: "contact.created", text: `Nuevo contacto: ${contact.name}`, contactId: contact.id });
      await emit(tx, "contact.created", { contactId: contact.id, source });
      return contact;
    });
  } catch (error) {
    if (isUniqueViolation(error, "phone")) throw new DomainError("Ya existe un contacto con ese WhatsApp", "conflict");
    throw error;
  }
}

export async function updateContact(id: string, input: ContactInput) {
  const before = await db.contact.findUnique({ where: { id } });
  if (!before) throw new DomainError("Contacto no encontrado", "not_found");
  await ensureNoPhoneDuplicate(input.phone, id);

  const changed = (Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[]).filter(
    (k) => (before as Record<string, unknown>)[k] !== (input as Record<string, unknown>)[k],
  );
  const lower = (t: string[]) => t.map((x) => x.toLocaleLowerCase("es-CO"));
  const added = input.tags.filter((t) => !lower(before.tags).includes(t.toLocaleLowerCase("es-CO")));
  const removed = before.tags.filter((t) => !lower(input.tags).includes(t.toLocaleLowerCase("es-CO")));

  try {
    return await db.$transaction(async (tx) => {
      const contact = await tx.contact.update({ where: { id }, data: input });
      if (before.phone !== contact.phone) await syncWhatsAppIdentity(tx, id, contact.phone);
      if (changed.length) {
        const detail = changed
          .map((k) => {
            if (k === "monthlyValue") return `valor mensual: ${formatCOP(contact.monthlyValue)}`;
            if (k === "phone") return `WhatsApp: ${formatPhone(contact.phone) || "—"}`;
            return FIELD_LABEL[k];
          })
          .join(", ");
        await logActivity(tx, {
          type: "contact.updated",
          text: `Datos actualizados (${detail})`,
          contactId: id,
          data: { fields: changed },
        });
      }
      for (const tag of added) await logActivity(tx, { type: "tag.added", text: `Etiqueta agregada: ${tag}`, contactId: id, data: { tag } });
      for (const tag of removed) await logActivity(tx, { type: "tag.removed", text: `Etiqueta quitada: ${tag}`, contactId: id, data: { tag } });
      return contact;
    });
  } catch (error) {
    if (isUniqueViolation(error, "phone")) throw new DomainError("Ya existe un contacto con ese WhatsApp", "conflict");
    throw error;
  }
}

/** Deletes a contact with its deals, conversation, notes and history. Blocked if it has cuentas de cobro. */
export async function deleteContact(id: string) {
  const contact = await db.contact.findUnique({ where: { id }, include: { _count: { select: { invoices: true } } } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  if (contact._count.invoices > 0) {
    throw new DomainError(
      `No se puede eliminar a ${contact.name}: tiene ${contact._count.invoices} cuenta(s) de cobro. Son registros de tus cobros.`,
      "conflict",
    );
  }
  await db.$transaction(async (tx) => {
    await tx.contact.delete({ where: { id } });
    await logActivity(tx, { type: "contact.deleted", text: `Contacto eliminado: ${contact.name}` });
  });
  return contact;
}

export async function addTag(contactId: string, tag: string) {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { tags: true } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  if (contact.tags.some((t) => t.toLocaleLowerCase("es-CO") === tag.toLocaleLowerCase("es-CO"))) return;
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data: { tags: { push: tag } } });
    await logActivity(tx, { type: "tag.added", text: `Etiqueta agregada: ${tag}`, contactId, data: { tag } });
  });
}

export async function removeTag(contactId: string, tag: string) {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { tags: true } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  if (!contact.tags.includes(tag)) return;
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data: { tags: contact.tags.filter((t) => t !== tag) } });
    await logActivity(tx, { type: "tag.removed", text: `Etiqueta quitada: ${tag}`, contactId, data: { tag } });
  });
}

/** Contacts with their main deal stage, for the Contactos table. */
export async function listContacts() {
  return db.contact.findMany({
    orderBy: { createdAt: "desc" },
    include: { deals: { orderBy: { createdAt: "asc" }, select: { id: true, stage: true }, take: 1 } },
  });
}

export const API_PAGE_SIZE = 50;

/**
 * Paginated search for the REST API: `q` matches name, company, phone, email or an exact tag; `tag` filters by
 * tag ignoring case. Newest first.
 */
export async function searchContacts(filter: { q?: string; tag?: string; page: number }) {
  const and: Prisma.ContactWhereInput[] = [];
  if (filter.q) {
    const q = filter.q;
    const digits = q.replace(/[^\d]/g, "");
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        { tags: { hasSome: await tagSpellings(q) } },
      ],
    });
  }
  if (filter.tag) and.push({ tags: { hasSome: await tagSpellings(filter.tag) } });
  const where: Prisma.ContactWhereInput = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    db.contact.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (filter.page - 1) * API_PAGE_SIZE, take: API_PAGE_SIZE }),
    db.contact.count({ where }),
  ]);
  return { rows, total };
}

/** Every stored spelling of a tag ("VIP", "vip"), so array filters can ignore case. */
async function tagSpellings(tag: string): Promise<string[]> {
  const wanted = tag.trim().toLocaleLowerCase("es-CO");
  const rows = await db.contact.findMany({ where: { tags: { isEmpty: false } }, select: { tags: true } });
  const found = new Set(rows.flatMap((r) => r.tags).filter((t) => t.toLocaleLowerCase("es-CO") === wanted));
  return found.size ? [...found] : [tag.trim()];
}

export async function getContact(id: string) {
  return db.contact.findUnique({ where: { id } });
}

/** Everything the contact sheet needs. */
export async function getContactSheet(id: string) {
  return db.contact.findUnique({
    where: { id },
    include: {
      deals: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: [{ done: "asc" }, { createdAt: "desc" }] },
      notes: { orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "desc" }, take: 100 },
      channels: true,
      conversation: { select: { unread: true, lastMessageAt: true } },
      _count: { select: { invoices: true } },
    },
  });
}

export async function listContactOptions() {
  return db.contact.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, company: true } });
}

/** All tags in use (for suggestions), sorted. */
export async function listAllTags() {
  const rows = await db.contact.findMany({ select: { tags: true } });
  const seen = new Map<string, string>();
  for (const tag of rows.flatMap((r) => r.tags)) {
    const key = tag.toLocaleLowerCase("es-CO");
    if (!seen.has(key)) seen.set(key, tag);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es-CO"));
}
