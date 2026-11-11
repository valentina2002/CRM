"use server";

import { z } from "zod";
import { fail, runAction } from "@/lib/action-result";
import { automationInputSchema } from "@/lib/automation-engine";
import { createAutomation, createAutomationFromTemplate, deleteAutomation, listAutomationRuns, setAutomationActive, updateAutomation } from "@/lib/services/automations";
import { requireUser } from "@/lib/session";
import { firstError } from "@/lib/validation";

const id = z.string().min(1).max(64);

export async function saveAutomationAction(automationId: string | null, raw: unknown) {
  await requireUser();
  const parsed = automationInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (automationId && !id.safeParse(automationId).success) return fail("Automatización inválida");
  return runAction(async () => {
    const a = automationId ? await updateAutomation(automationId, parsed.data) : await createAutomation(parsed.data);
    return { id: a.id };
  });
}

export async function toggleAutomationAction(automationId: string, active: boolean) {
  if (!id.safeParse(automationId).success) return fail("Automatización inválida");
  return runAction(() => setAutomationActive(automationId, Boolean(active)));
}

export async function deleteAutomationAction(automationId: string) {
  if (!id.safeParse(automationId).success) return fail("Automatización inválida");
  return runAction(() => deleteAutomation(automationId));
}

/** Read-only: history dialog. */
export async function automationRunsAction(automationId: string) {
  await requireUser();
  if (!id.safeParse(automationId).success) return [];
  return listAutomationRuns(automationId);
}

export async function applyTemplateAction(key: string) {
  if (!/^[a-z-]{1,40}$/.test(key)) return fail("Plantilla inválida");
  return runAction(async () => {
    const a = await createAutomationFromTemplate(key);
    return { id: a.id, active: a.active };
  });
}
