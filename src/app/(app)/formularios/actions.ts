"use server";

import { z } from "zod";
import { fail, runAction } from "@/lib/action-result";
import { SERVICES } from "@/lib/constants";
import { safeHttpUrl } from "@/lib/lead-form";
import { createLeadForm, deleteLeadForm, setLeadFormActive, updateLeadForm } from "@/lib/services/lead-forms";
import { requireUser } from "@/lib/session";
import { firstError, normalizeTags } from "@/lib/validation";

const id = z.string().min(1).max(64);

const formSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre al formulario").max(80),
  tags: z.union([z.string(), z.array(z.string())]).optional().transform((v) => normalizeTags(v)),
  service: z.enum(SERVICES).or(z.literal("")).optional().transform((v) => v || null),
  successMessage: z.string().trim().min(1, "Escribe el mensaje de agradecimiento").max(300),
  redirectUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const url = safeHttpUrl(v);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "La página de agradecimiento debe ser una URL que empiece por https://" });
        return z.NEVER;
      }
      return url;
    }),
});

export async function saveLeadFormAction(formId: string | null, raw: unknown) {
  await requireUser();
  const parsed = formSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (formId && !id.safeParse(formId).success) return fail("Formulario inválido");
  return runAction(async () => {
    const form = formId ? await updateLeadForm(formId, parsed.data) : await createLeadForm(parsed.data);
    return { id: form.id };
  });
}

export async function toggleLeadFormAction(formId: string, active: boolean) {
  if (!id.safeParse(formId).success) return fail("Formulario inválido");
  return runAction(() => setLeadFormActive(formId, Boolean(active)));
}

export async function deleteLeadFormAction(formId: string) {
  if (!id.safeParse(formId).success) return fail("Formulario inválido");
  return runAction(() => deleteLeadForm(formId));
}
