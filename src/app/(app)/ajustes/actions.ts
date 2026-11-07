"use server";

import { z } from "zod";
import { fail, runAction } from "@/lib/action-result";
import { completeEmbeddedSignup, connectWhatsApp, disconnectWhatsApp, requestCoexistenceSync } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { firstError } from "@/lib/validation";

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
