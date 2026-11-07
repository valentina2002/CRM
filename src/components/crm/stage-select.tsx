"use client";

import { changeStageAction } from "@/app/(app)/crm-actions";
import { NativeSelect } from "@/components/ui/native-select";
import type { Stage } from "@/generated/prisma/enums";
import { STAGES, STAGE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAction } from "./use-action";

/** Stage picker; changing it moves the deal (and emits deal.stage_changed). */
export function StageSelect({ dealId, stage, className, onChanged }: { dealId: string; stage: Stage; className?: string; onChanged?: (s: Stage) => void }) {
  const { pending, run } = useAction();
  return (
    <NativeSelect
      aria-label="Etapa"
      value={stage}
      disabled={pending}
      className={cn("h-8 text-xs text-muted-foreground", className)}
      onChange={(e) => {
        const next = e.target.value as Stage;
        onChanged?.(next);
        run(() => changeStageAction(dealId, next), { success: `Movido a ${STAGE_LABEL[next]}` });
      }}
    >
      {STAGES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </NativeSelect>
  );
}
