import type { ReactNode } from "react";

/** Title + subtitle + actions row, same as the prototype's `top()` helper. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-.01em]">{title}</h1>
        <p className="mt-[3px] text-muted-foreground">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Temporary body for modules that are built in a later phase. */
export function ComingSoon({ phase, children }: { phase: string; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border bg-card p-[18px]">
      <p className="font-semibold">Este módulo se construye en la {phase}.</p>
      <p className="mt-1 text-muted-foreground">Mientras tanto puedes ver cómo funcionará en el prototipo.</p>
      {children}
    </div>
  );
}
