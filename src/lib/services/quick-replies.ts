import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "./core";

/** Shown until Valentina saves her own list. */
export const DEFAULT_QUICK_REPLIES = ["Hola {nombre}, ¿cómo estás?", "Te comparto el informe SEO del mes.", "¿Agendamos una llamada esta semana?", "Te envío la cuenta de cobro del mes."];
export const MAX_QUICK_REPLIES = 12;

export async function listQuickReplies(): Promise<string[]> {
  const rows = await db.quickReply.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { text: true } });
  return rows.length ? rows.map((r) => r.text) : DEFAULT_QUICK_REPLIES;
}

/** Replaces the whole list (order = position). An empty list goes back to the defaults. */
export async function saveQuickReplies(texts: string[]) {
  await db.$transaction(async (tx) => {
    await tx.quickReply.deleteMany();
    if (texts.length) await tx.quickReply.createMany({ data: texts.map((text, position) => ({ text, position })) });
    await logActivity(tx, { type: "quick_replies.saved", text: "Respuestas rápidas actualizadas" });
  });
}
