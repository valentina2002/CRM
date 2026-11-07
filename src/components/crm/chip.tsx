import type { ReactNode } from "react";
import type { Stage } from "@/generated/prisma/enums";
import { STAGE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Small gray pill, like `.chip` in the prototype. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("my-px mr-[3px] inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-medium text-[#3d4a5e]", className)}>
      {children}
    </span>
  );
}

const STAGE_TONE: Record<Stage, string> = {
  PROSPECT: "bg-secondary text-[#3d4a5e]",
  PROPOSAL_SENT: "bg-info-soft text-info",
  NEGOTIATION: "bg-warning-soft text-warning",
  ACTIVE_CLIENT: "bg-success-soft text-primary",
  LOST: "bg-danger-soft text-destructive",
};

export function StageChip({ stage }: { stage: Stage }) {
  return <Chip className={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Chip>;
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <div className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-[#d7e0ec] text-[13px] font-bold text-[#33435c]", className)} aria-hidden>
      {initials}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-[10px] border bg-card p-[18px]", className)}>
      {title || actions ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h3 className="text-[14.5px] font-semibold">{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
