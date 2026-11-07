"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { Stage } from "@/generated/prisma/enums";
import { fail, runAction } from "@/lib/action-result";
import { requireUser } from "@/lib/session";
import { addTag, createContact, deleteContact, removeTag, updateContact } from "@/lib/services/contacts";
import { changeDealStage, createDeal, deleteDeal, updateDeal } from "@/lib/services/deals";
import { addNote, createTask, deleteNote, deleteTask, toggleTask, updateNote } from "@/lib/services/tasks-notes";
import {
  contactInputSchema,
  dealInputSchema,
  firstError,
  noteInputSchema,
  stageChangeSchema,
  tagInputSchema,
  taskInputSchema,
} from "@/lib/validation";

const id = z.string().min(1).max(64);

// Every action re-checks the session (server actions are reachable by direct POST).

export async function saveContactAction(contactId: string | null, raw: unknown) {
  await requireUser();
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (contactId && !id.safeParse(contactId).success) return fail("Contacto inválido");
  return runAction(async () => {
    const contact = contactId ? await updateContact(contactId, parsed.data) : await createContact(parsed.data);
    return { id: contact.id };
  });
}

export async function deleteContactAction(contactId: string) {
  if (!id.safeParse(contactId).success) return fail("Contacto inválido");
  return runAction(async () => {
    await deleteContact(contactId);
  });
}

export async function addTagAction(raw: unknown) {
  await requireUser();
  const parsed = tagInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(() => addTag(parsed.data.contactId, parsed.data.tag));
}

export async function removeTagAction(contactId: string, tag: string) {
  if (!id.safeParse(contactId).success || !tag) return fail("Etiqueta inválida");
  return runAction(() => removeTag(contactId, tag));
}

export async function createDealAction(raw: unknown) {
  await requireUser();
  const parsed = dealInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    const deal = await createDeal(parsed.data);
    return { id: deal.id };
  });
}

export async function changeStageAction(dealId: string, stage: string) {
  await requireUser();
  const parsed = stageChangeSchema.safeParse({ dealId, stage });
  if (!parsed.success) return fail("Etapa inválida");
  return runAction(async () => {
    await changeDealStage(parsed.data.dealId, parsed.data.stage as Stage);
  });
}

export async function updateDealAction(dealId: string, raw: unknown) {
  await requireUser();
  const parsed = dealInputSchema.pick({ title: true, value: true }).safeParse(raw);
  if (!parsed.success || !id.safeParse(dealId).success) return fail(parsed.error ? firstError(parsed.error) : "Oportunidad inválida");
  return runAction(async () => {
    await updateDeal(dealId, parsed.data);
  });
}

export async function deleteDealAction(dealId: string) {
  if (!id.safeParse(dealId).success) return fail("Oportunidad inválida");
  return runAction(() => deleteDeal(dealId));
}

export async function createTaskAction(raw: unknown) {
  await requireUser();
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    await createTask(parsed.data);
  });
}

export async function toggleTaskAction(taskId: string) {
  if (!id.safeParse(taskId).success) return fail("Tarea inválida");
  return runAction(async () => {
    await toggleTask(taskId);
  });
}

export async function deleteTaskAction(taskId: string) {
  if (!id.safeParse(taskId).success) return fail("Tarea inválida");
  return runAction(() => deleteTask(taskId));
}

export async function addNoteAction(raw: unknown) {
  await requireUser();
  const parsed = noteInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    await addNote(parsed.data.contactId, parsed.data.body);
  });
}

export async function updateNoteAction(noteId: string, body: string) {
  await requireUser();
  const parsed = noteInputSchema.shape.body.safeParse(body);
  if (!parsed.success || !id.safeParse(noteId).success) return fail("La nota está vacía");
  return runAction(async () => {
    await updateNote(noteId, parsed.data);
  });
}

export async function deleteNoteAction(noteId: string) {
  if (!id.safeParse(noteId).success) return fail("Nota inválida");
  return runAction(() => deleteNote(noteId));
}

/** Delete from the contact sheet, then go back to the list (the sheet no longer exists). */
export async function deleteContactAndLeaveAction(contactId: string) {
  const result = await deleteContactAction(contactId);
  if (result.ok) redirect("/contactos");
  return result;
}
