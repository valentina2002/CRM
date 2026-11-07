import "server-only";
import { db } from "@/lib/db";
import { isoToDbDate } from "@/lib/format";
import type { TaskInput } from "@/lib/validation";
import { DomainError, logActivity } from "./core";

export async function createTask(input: TaskInput) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: { text: input.text, contactId: input.contactId, dueAt: input.dueAt ? isoToDbDate(input.dueAt) : null },
    });
    if (input.contactId) {
      await logActivity(tx, { type: "task.created", text: `Tarea creada: ${task.text}`, contactId: input.contactId, data: { taskId: task.id } });
    }
    return task;
  });
}

export async function toggleTask(id: string) {
  const task = await db.task.findUnique({ where: { id } });
  if (!task) throw new DomainError("Tarea no encontrada", "not_found");
  return db.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id }, data: { done: !task.done } });
    if (task.contactId) {
      await logActivity(tx, {
        type: updated.done ? "task.done" : "task.reopened",
        text: `${updated.done ? "Tarea completada" : "Tarea reabierta"}: ${task.text}`,
        contactId: task.contactId,
        data: { taskId: id },
      });
    }
    return updated;
  });
}

export async function deleteTask(id: string) {
  await db.task.delete({ where: { id } }).catch(() => {
    throw new DomainError("Tarea no encontrada", "not_found");
  });
}

export async function addNote(contactId: string, body: string) {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!contact) throw new DomainError("Contacto no encontrado", "not_found");
  return db.$transaction(async (tx) => {
    const note = await tx.note.create({ data: { contactId, body } });
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    await logActivity(tx, { type: "note.added", text: `Nota agregada: ${preview}`, contactId, data: { noteId: note.id } });
    return note;
  });
}

export async function updateNote(id: string, body: string) {
  const note = await db.note.findUnique({ where: { id } });
  if (!note) throw new DomainError("Nota no encontrada", "not_found");
  return db.note.update({ where: { id }, data: { body } });
}

export async function deleteNote(id: string) {
  const note = await db.note.findUnique({ where: { id } });
  if (!note) throw new DomainError("Nota no encontrada", "not_found");
  await db.$transaction(async (tx) => {
    await tx.note.delete({ where: { id } });
    await logActivity(tx, { type: "note.deleted", text: "Nota eliminada", contactId: note.contactId });
  });
}
