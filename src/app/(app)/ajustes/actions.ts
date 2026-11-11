"use server";

import { z } from "zod";
import { fail, runAction } from "@/lib/action-result";
import { createApiKey, revokeApiKey } from "@/lib/services/api-keys";
import { createWebhookEndpoint, deleteWebhookEndpoint, sendTestWebhook, setWebhookEndpointActive } from "@/lib/services/webhooks-out";
import { completeEmbeddedSignup, connectWhatsApp, disconnectWhatsApp, requestCoexistenceSync } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { firstError } from "@/lib/validation";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/outgoing";

const metaId = z.string().trim().regex(/^\d{5,25}$/, "Los IDs de Meta son solo números");

const manualSchema = z.object({
  wabaId: metaId,
  phoneNumberId: metaId,
  token: z.string().trim().min(20, "Pega el token de acceso completo").max(1000),
  coexistence: z.boolean(),
});

export async function connectManualAction(raw: unknown) {
  await requireUser();
  const parsed = manualSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(async () => {
    const phone = await connectWhatsApp(parsed.data);
    return { displayPhone: phone.display_phone_number ?? null };
  });
}

const signupSchema = z.object({
  code: z.string().min(10).max(2000),
  wabaId: metaId,
  phoneNumberId: metaId.nullable().optional(),
});

/** Embedded Signup finished in the browser: exchange the code (30 s TTL) and finish onboarding. */
export async function completeSignupAction(raw: unknown) {
  await requireUser();
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return fail("Meta no devolvió los datos de la conexión. Intenta de nuevo.");
  return runAction(async () => {
    const phone = await completeEmbeddedSignup(parsed.data);
    return { displayPhone: phone.display_phone_number ?? null };
  });
}

export async function requestSyncAction() {
  return runAction(() => requestCoexistenceSync());
}

export async function disconnectAction() {
  return runAction(() => disconnectWhatsApp());
}

// ---------- Fase 5 · API keys y webhooks salientes ----------

const keyNameSchema = z.object({ name: z.string().trim().min(1, "Ponle un nombre a la API key (ej.: Zapier)").max(60, "Máximo 60 caracteres") });

/** Returns the plain key: the UI shows it once and it is never readable again. */
export async function createApiKeyAction(raw: unknown) {
  await requireUser();
  const parsed = keyNameSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(() => createApiKey(parsed.data.name));
}

export async function revokeApiKeyAction(id: string) {
  return runAction(() => revokeApiKey(id));
}

const webhookSchema = z.object({
  url: z.string().trim().min(1, "Escribe la URL de destino").max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Elige al menos un evento"),
});

/** Returns the signing secret: the UI shows it once. */
export async function createWebhookAction(raw: unknown) {
  await requireUser();
  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  return runAction(() => createWebhookEndpoint(parsed.data));
}

export async function setWebhookActiveAction(id: string, active: boolean) {
  return runAction(() => setWebhookEndpointActive(id, active));
}

export async function deleteWebhookAction(id: string) {
  return runAction(() => deleteWebhookEndpoint(id));
}

export async function testWebhookAction(id: string) {
  return runAction(() => sendTestWebhook(id));
}
