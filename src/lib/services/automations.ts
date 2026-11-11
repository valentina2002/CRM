import "server-only";
import { automationInputSchema, type AutomationInput, type RunDetail } from "@/lib/automation-engine";
import { AUTOMATION_TEMPLATES } from "@/lib/automation-templates";
import { db } from "@/lib/db";
import { DomainError, logActivity } from "./core";

export async function listAutomations() {
  return db.automation.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], // id breaks ties (seeded rows share createdAt)
    include: {
      runs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, ok: true } },
      _count: { select: { jobs: { where: { status: "pending" } } } },
    },
  });
}

export async function createAutomation(input: AutomationInput, active = true) {
  return db.$transaction(async (tx) => {
    const automation = await tx.automation.create({ data: { ...input, active } });
    await logActivity(tx, { type: "automation.saved", text: `Automatización “${automation.name}” creada` });
    return automation;
  });
}

/** Creates an automation from a ready-made template (see src/lib/automation-templates.ts). */
export async function createAutomationFromTemplate(key: string) {
  const template = AUTOMATION_TEMPLATES.find((t) => t.key === key);
  if (!template) throw new DomainError("Plantilla no encontrada", "not_found");
  const input = automationInputSchema.parse(template.automation);
  return createAutomation(input, !template.startPaused);
}

export async function updateAutomation(id: string, input: AutomationInput) {
  const exists = await db.automation.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new DomainError("Automatización no encontrada", "not_found");
  return db.$transaction(async (tx) => {
    const automation = await tx.automation.update({ where: { id }, data: input });
    await logActivity(tx, { type: "automation.saved", text: `Automatización “${automation.name}” guardada` });
    return automation;
  });
}

export async function setAutomationActive(id: string, active: boolean) {
  const automation = await db.automation.findUnique({ where: { id } });
  if (!automation) throw new DomainError("Automatización no encontrada", "not_found");
  await db.$transaction(async (tx) => {
    await tx.automation.update({ where: { id }, data: { active } });
    // Pausing cancels the runs waiting to continue (they would be skipped anyway when their time comes).
    if (!active) await tx.automationJob.updateMany({ where: { automationId: id, status: "pending" }, data: { status: "cancelled" } });
    await logActivity(tx, { type: "automation.toggled", text: `Automatización “${automation.name}” ${active ? "activada" : "pausada"}` });
  });
}

export async function deleteAutomation(id: string) {
  const automation = await db.automation.findUnique({ where: { id } });
  if (!automation) throw new DomainError("Automatización no encontrada", "not_found");
  await db.$transaction(async (tx) => {
    await tx.automation.delete({ where: { id } });
    await logActivity(tx, { type: "automation.deleted", text: `Automatización “${automation.name}” eliminada` });
  });
}

/** Last executions of an automation, newest first. */
export async function listAutomationRuns(automationId: string, take = 50) {
  const runs = await db.automationRun.findMany({ where: { automationId }, orderBy: { createdAt: "desc" }, take });
  return runs.map((r) => ({ id: r.id, ok: r.ok, createdAt: r.createdAt, detail: r.detail as RunDetail | null }));
}
