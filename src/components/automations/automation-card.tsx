"use client";

import { History, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { startTransition, useOptimistic, useState } from "react";
import { toast } from "sonner";
import { automationRunsAction, deleteAutomationAction, toggleAutomationAction } from "@/app/(app)/automatizaciones/actions";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeAction, type AutomationAction, type RunDetail } from "@/lib/automation-engine";
import { ACTION_LABEL, CONTACT_SOURCE_LABEL, STAGE_LABEL, TRIGGER_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutomationBuilder, type EditableAutomation } from "./automation-builder";

export type AutomationView = EditableAutomation & { active: boolean; runCount: number; waiting: number; lastRun: { createdAt: Date; ok: boolean } | null };

function actionText(a: AutomationAction) {
  const value = describeAction(a);
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

const isFlowStep = (a: AutomationAction) => a.type === "wait" || a.type === "wait_due" || a.type === "stop_if";

export function AutomationCard({ automation }: { automation: AutomationView }) {
  const [active, setActive] = useOptimistic(automation.active);
  const conditionLabel =
    automation.condition && automation.trigger === "DEAL_STAGE_CHANGED"
      ? STAGE_LABEL[automation.condition as keyof typeof STAGE_LABEL]
      : automation.condition && automation.trigger === "CONTACT_CREATED"
        ? (CONTACT_SOURCE_LABEL[automation.condition] ?? automation.condition)
        : automation.condition;

  return (
    <article className="flex items-start gap-4 rounded-[10px] border bg-card p-[18px]">
      <label className="relative mt-0.5 inline-flex h-[22px] w-10 shrink-0 cursor-pointer" title={active ? "Pausar" : "Activar"}>
        <input
          type="checkbox"
          className="peer sr-only"
          checked={active}
          aria-label={`${active ? "Pausar" : "Activar"} ${automation.name}`}
          onChange={() =>
            startTransition(async () => {
              const next = !active;
              setActive(next);
              const r = await toggleAutomationAction(automation.id, next);
              if (!r.ok) toast.error(r.error);
              else toast(next ? "Automatización activada" : "Automatización pausada");
            })
          }
        />
        <span className="absolute inset-0 rounded-full bg-[#cdd4de] transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50" />
        <span className="absolute top-[3px] left-[3px] size-4 rounded-full bg-white transition-transform peer-checked:translate-x-[18px]" />
      </label>

      <div className="min-w-0 flex-1">
        <div className="font-semibold">{automation.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-[7px] border border-[#f0dcae] bg-warning-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-[#7a5307]">
            Cuando: {TRIGGER_LABEL[automation.trigger]}
            {conditionLabel ? ` · “${conditionLabel}”` : ""}
          </span>
          {automation.actions.map((a, i) => (
            <span key={i} className="contents">
              <span className="text-muted-foreground">→</span>
              <span
                className={cn(
                  "rounded-[7px] border px-2.5 py-[5px] text-[12.5px]",
                  isFlowStep(a) ? "border-dashed border-[#c9d3e0] bg-info-soft text-info" : "bg-[#fafbfc]",
                )}
              >
                <strong>{ACTION_LABEL[a.type]}</strong>: {actionText(a)}
              </span>
            </span>
          ))}
        </div>
        <div className="mt-2 text-[12.5px] text-muted-foreground">
          Ejecutada {automation.runCount} {automation.runCount === 1 ? "vez" : "veces"} · {active ? "Activa" : "Pausada"}
          {automation.waiting ? (
            <span className="text-info">
              {" "}
              · ⏳ {automation.waiting} {automation.waiting === 1 ? "contacto en espera" : "contactos en espera"}
            </span>
          ) : null}
          {automation.lastRun ? (
            <>
              {" "}
              · última: {formatDateTime(automation.lastRun.createdAt)}
              {automation.lastRun.ok ? "" : <span className="text-destructive"> (con errores)</span>}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <RunsDialog automationId={automation.id} name={automation.name} />
        <AutomationBuilder
          automation={automation}
          trigger={
            <Button variant="ghost" size="icon-sm" title="Editar" aria-label={`Editar ${automation.name}`}>
              <Pencil />
            </Button>
          }
        />
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-sm" title="Eliminar" aria-label={`Eliminar ${automation.name}`}>
              <Trash2 />
            </Button>
          }
          description={<>¿Eliminar la automatización <strong>{automation.name}</strong> y su historial?</>}
          confirmLabel="Eliminar"
          success="Automatización eliminada"
          action={() => deleteAutomationAction(automation.id)}
        />
      </div>
    </article>
  );
}

type Run = { id: string; ok: boolean; createdAt: Date; detail: RunDetail | null };

function RunsDialog({ automationId, name }: { automationId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<Run[] | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Historial de ejecuciones"
        aria-label={`Historial de ${name}`}
        onClick={() => {
          setOpen(true);
          setRuns(null);
          automationRunsAction(automationId).then(setRuns, () => setRuns([]));
        }}
      >
        <History />
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Historial · {name}</DialogTitle>
          <DialogDescription>Últimas 50 ejecuciones, de la más reciente a la más antigua.</DialogDescription>
        </DialogHeader>
        {runs === null ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground">Todavía no se ha ejecutado.</p>
        ) : (
          <ul className="grid gap-2.5">
            {runs.map((r) => (
              <li key={r.id} className={cn("rounded-lg border p-3", !r.ok && "border-[#f3c9c9] bg-danger-soft/40")}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                  <span>
                    {r.detail ? (
                      <Link href={`/contactos/${r.detail.contactId}`} className="font-semibold hover:text-primary hover:underline">
                        {r.detail.contactName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {r.detail?.segment === "resume" ? "Continuación · " : ""}
                    {formatDateTime(r.createdAt)} · {r.ok ? <span className="text-primary">OK</span> : <span className="text-destructive">Con errores</span>}
                  </span>
                </div>
                <ol className="mt-1.5 grid gap-1 text-[12.5px]">
                  {r.detail?.actions.map((a, i) => (
                    <li key={i} className={cn("flex gap-1.5", !a.ok && "text-destructive")}>
                      <span aria-hidden>{a.ok ? "✓" : "✗"}</span>
                      <span>
                        <strong>{ACTION_LABEL[a.type]}:</strong> <span className="whitespace-pre-wrap">{a.message}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                {r.detail?.pausedUntil ? <p className="mt-1.5 text-[12px] text-info">⏳ Sigue el {formatDateTime(r.detail.pausedUntil)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
