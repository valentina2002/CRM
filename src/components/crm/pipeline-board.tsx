"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { startTransition, useOptimistic, useState } from "react";
import { toast } from "sonner";
import { changeStageAction } from "@/app/(app)/crm-actions";
import { NativeSelect } from "@/components/ui/native-select";
import type { Stage } from "@/generated/prisma/enums";
import { STAGES, STAGE_LABEL } from "@/lib/constants";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BoardDeal = {
  id: string;
  title: string;
  value: number;
  stage: Stage;
  contact: { id: string; name: string; company: string | null };
};

/** Kanban with drag & drop (mouse, touch, keyboard) plus a stage selector on each card (mobile). */
export function PipelineBoard({ deals }: { deals: BoardDeal[] }) {
  const [board, moveDeal] = useOptimistic(deals, (state, { id, stage }: { id: string; stage: Stage }) =>
    state.map((d) => (d.id === id ? { ...d, stage } : d)),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function move(id: string, stage: Stage) {
    const deal = board.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    startTransition(async () => {
      moveDeal({ id, stage });
      const result = await changeStageAction(id, stage);
      if (result.ok) toast.success(`“${deal.title}” pasó a ${STAGE_LABEL[stage]}`);
      else toast.error(result.error);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (event.over) move(String(event.active.id), event.over.id as Stage);
  }

  const active = activeId ? board.find((d) => d.id === activeId) : null;

  return (
    <DndContext
      id="pipeline-board" // stable id: avoids server/client mismatch in aria-describedby
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: { draggable: "Presiona espacio para levantar la tarjeta, usa las flechas para moverla y espacio para soltarla." },
      }}
    >
      <div className="grid snap-x grid-cols-[repeat(5,minmax(200px,1fr))] gap-3 overflow-x-auto pb-1.5">
        {STAGES.map((s) => {
          const inStage = board.filter((d) => d.stage === s.value);
          return (
            <Column key={s.value} stage={s.value} label={s.label} count={inStage.length} total={inStage.reduce((a, d) => a + d.value, 0)}>
              {inStage.map((d) => (
                <DealCard key={d.id} deal={d} onMove={move} hidden={d.id === activeId} />
              ))}
              {inStage.length === 0 ? <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">Suelta aquí</p> : null}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{active ? <CardBody deal={active} className="rotate-2 shadow-lg" /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ stage, label, count, total, children }: { stage: Stage; label: string; count: number; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section ref={setNodeRef} aria-label={label} className={cn("min-h-[380px] snap-start rounded-[10px] bg-[#eaeef3] p-2.5 transition-colors", isOver && "bg-[#dbe7f7]")}>
      <div className="flex items-baseline justify-between px-1 pt-0.5 pb-2.5 text-[13px] font-semibold">
        {label}
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {count} · {formatCOP(total)}
        </span>
      </div>
      {children}
    </section>
  );
}

function DealCard({ deal, onMove, hidden }: { deal: BoardDeal; onMove: (id: string, stage: Stage) => void; hidden: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("mb-[9px] touch-manipulation", hidden && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-roledescription="tarjeta arrastrable"
    >
      <CardBody deal={deal}>
        <NativeSelect
          aria-label={`Etapa de ${deal.title}`}
          value={deal.stage}
          className="mt-1.5 h-7 bg-[#fafbfc] px-1 text-xs text-muted-foreground"
          // Keep the select usable: don't start a drag from it.
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onMove(deal.id, e.target.value as Stage)}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </CardBody>
    </div>
  );
}

function CardBody({ deal, className, children }: { deal: BoardDeal; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("cursor-grab rounded-[9px] border bg-white p-[11px] shadow-[0_1px_2px_rgba(15,26,44,.04)] active:cursor-grabbing", className)}>
      <div className="text-[13.5px] font-semibold">{deal.title}</div>
      <div className="mt-0.5 mb-2 text-[12.5px] text-muted-foreground">
        {deal.contact.company ? `${deal.contact.company} · ` : ""}
        <Link
          href={`/contactos/${deal.contact.id}`}
          className="hover:text-primary hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {deal.contact.name}
        </Link>
      </div>
      <strong className="text-[12.5px] tabular-nums">{formatCOP(deal.value)}</strong>
      {children}
    </div>
  );
}
