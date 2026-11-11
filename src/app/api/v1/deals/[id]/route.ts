import { ApiError, apiRoute, ok, readJson, valid } from "@/lib/api/handler";
import { parseDealPatch } from "@/lib/api/schemas";
import { serializeDeal } from "@/lib/api/serialize";
import { changeDealStage, getDeal, updateDeal } from "@/lib/services/deals";

/** PATCH /api/v1/deals/{id} — `{ stage?, value?, title? }`. A stage change emits `deal.stage_changed`. */
export const PATCH = apiRoute<{ id: string }>(async ({ request, params }) => {
  const input = valid(parseDealPatch(await readJson(request)));
  const current = await getDeal(params.id);
  if (!current) throw new ApiError(404, "Oportunidad no encontrada");
  if (input.value !== undefined || input.title !== undefined) {
    await updateDeal(params.id, { title: input.title ?? current.title, value: input.value ?? current.value });
  }
  if (input.stage) await changeDealStage(params.id, input.stage);
  const updated = await getDeal(params.id);
  return ok(serializeDeal(updated ?? current));
});
