import "server-only";
import type { Stage } from "@/generated/prisma/enums";
import { STAGE_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import type { DealInput } from "@/lib/validation";
import { DomainError, emit, logActivity } from "./core";

export async function createDeal(input: DealInput) {
  const contact = await db.contact.findUnique({ where: { id: input.contactId }, select: { name: true } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  const stage = input.stage as Stage;
  return db.$transaction(async (tx) => {
    const deal = await tx.deal.create({ data: { contactId: input.contactId, title: input.title, value: input.value, stage } });
    await logActivity(tx, {
      type: "deal.created",
      text: `Nueva oportunidad: ${deal.title} (${formatCOP(deal.value)}) en ${STAGE_LABEL[stage]}`,
      contactId: input.contactId,
      data: { dealId: deal.id, stage },
    });
    return deal;
  });
}

/** Moves a deal to another stage, logs it in the contact history and emits `deal.stage_changed`. */
export async function changeDealStage(dealId: string, stage: Stage) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { contact: { select: { name: true } } } });
  if (!deal) throw new DomainError("Oportunidad no encontrada", "not_found");
  if (deal.stage === stage) return deal;
  return db.$transaction(async (tx) => {
    const updated = await tx.deal.update({ where: { id: dealId }, data: { stage } });
    await logActivity(tx, {
      type: "deal.stage_changed",
      text: `“${deal.title}” de ${deal.contact.name} pasó de ${STAGE_LABEL[deal.stage]} a ${STAGE_LABEL[stage]}`,
      contactId: deal.contactId,
      data: { dealId, from: deal.stage, to: stage },
    });
    await emit(tx, "deal.stage_changed", { dealId, contactId: deal.contactId, from: deal.stage, to: stage });
    return updated;
  });
}

export async function updateDeal(dealId: string, input: { title: string; value: number }) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new DomainError("Oportunidad no encontrada", "not_found");
  return db.$transaction(async (tx) => {
    const updated = await tx.deal.update({ where: { id: dealId }, data: input });
    if (deal.title !== input.title || deal.value !== input.value) {
      await logActivity(tx, {
        type: "deal.updated",
        text: `Oportunidad actualizada: ${updated.title} (${formatCOP(updated.value)})`,
        contactId: deal.contactId,
        data: { dealId },
      });
    }
    return updated;
  });
}

export async function deleteDeal(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new DomainError("Oportunidad no encontrada", "not_found");
  await db.$transaction(async (tx) => {
    await tx.deal.delete({ where: { id: dealId } });
    await logActivity(tx, { type: "deal.deleted", text: `Oportunidad eliminada: ${deal.title}`, contactId: deal.contactId });
  });
}

/** Deals for the Kanban, with their contact. */
export async function listBoardDeals() {
  return db.deal.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { contact: { select: { id: true, name: true, company: true } } },
  });
}

/** Deals for the REST API, optionally filtered by stage or contact. */
export async function listDeals(filter: { stage?: Stage; contactId?: string } = {}) {
  return db.deal.findMany({
    where: { ...(filter.stage ? { stage: filter.stage } : {}), ...(filter.contactId ? { contactId: filter.contactId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

export async function getDeal(id: string) {
  return db.deal.findUnique({ where: { id } });
}
