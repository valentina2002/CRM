"use server";

import { z } from "zod";
import { fail, runAction } from "@/lib/action-result";
import {
  markConversationRead,
  retryMessage,
  sendTemplateMessage,
  sendTextMessage,
  simulateWebhook,
} from "@/lib/services/conversations";
import { getSendingCredentials } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { listApprovedTemplates } from "@/lib/whatsapp/graph";
import { firstError } from "@/lib/validation";

const id = z.string().min(1).max(64);
const textSchema = z.string().trim().min(1, "Escribe un mensaje").max(4096, "El mensaje es demasiado largo (máx. 4096)");

export async function sendMessageAction(contactId: string, text: string) {
  await requireUser();
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (!id.safeParse(contactId).success) return fail("Contacto inválido");
  return runAction(async () => {
    await sendTextMessage(contactId, parsed.data);
  });
}

const templateSchema = z.object({
  contactId: id,
  name: z.string().min(1).max(512),
  language: z.string().min(2).max(15),
  params: z.array(z.string().trim().min(1, "Completa todas las variables de la plantilla").max(1024)).max(20),
  preview: z.string().max(4096),
});

export async function sendTemplateAction(raw: unknown) {
  await requireUser();
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    await sendTemplateMessage(parsed.data.contactId, parsed.data);
  });
}

export async function markReadAction(contactId: string) {
  if (!id.safeParse(contactId).success) return fail("Contacto inválido");
  return runAction(() => markConversationRead(contactId));
}

export async function retryMessageAction(messageId: string) {
  if (!id.safeParse(messageId).success) return fail("Mensaje inválido");
  return runAction(() => retryMessage(messageId));
}

/** Approved templates of the connected WABA (read-only). */
export async function listTemplatesAction() {
  await requireUser();
  const creds = await getSendingCredentials();
  if (!creds) return { ok: false as const, error: "Conecta WhatsApp en Ajustes para usar plantillas." };
  try {
    const templates = await listApprovedTemplates(creds.token, creds.wabaId);
    return {
      ok: true as const,
      templates: templates.map((t) => ({
        name: t.name,
        language: t.language,
        category: t.category,
        body: t.components.find((c) => c.type === "BODY")?.text ?? "",
      })),
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No se pudieron cargar las plantillas" };
  }
}

export async function simulateAction(contactId: string, kind: "inbound" | "echo", text: string) {
  await requireUser();
  const parsed = textSchema.safeParse(text);
  if (!parsed.success || !id.safeParse(contactId).success || !["inbound", "echo"].includes(kind)) return fail("Datos inválidos");
  return runAction(() => simulateWebhook(contactId, kind, parsed.data));
}
