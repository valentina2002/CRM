"use client";

import { CheckSquare, History, KanbanSquare, StickyNote, Tag, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { deleteDealAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Stage } from "@/generated/prisma/enums";
import { formatCOP, formatDateTime } from "@/lib/format";
import { ConfirmDialog } from "./confirm-dialog";
import { DealDialog } from "./deal-dialog";
import { NotesPanel, type NoteItem } from "./notes-panel";
import { StageSelect } from "./stage-select";
import { TagsPanel } from "./tags-panel";
import { NewTaskForm, TaskList, type TaskItem } from "./task-list";

export type SheetData = {
  contactId: string;
  deals: { id: string; title: string; value: number; stage: Stage }[];
  activity: { id: string; text: string; type: string; createdAt: Date }[];
  tasks: TaskItem[];
  tags: string[];
  tagSuggestions: string[];
  notes: NoteItem[];
};

function Count({ n }: { n: number }) {
  return n ? <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold text-muted-foreground">{n}</span> : null;
}

const triggerClass =
  "h-auto flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent px-2.5 py-2 text-[13px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

/** Icon tabs of the contact sheet: Etapa · Historial · Tareas · Etiquetas · Notas. */
export function ContactSheetTabs({ data, defaultTab = "etapa" }: { data: SheetData; defaultTab?: string }) {
  const pendingTasks = data.tasks.filter((t) => !t.done).length;
  const tabs: { value: string; label: string; icon: ReactNode; count?: number }[] = [
    { value: "etapa", label: "Etapa", icon: <KanbanSquare />, count: data.deals.length },
    { value: "historial", label: "Historial", icon: <History /> },
    { value: "tareas", label: "Tareas", icon: <CheckSquare />, count: pendingTasks },
    { value: "etiquetas", label: "Etiquetas", icon: <Tag />, count: data.tags.length },
    { value: "notas", label: "Notas", icon: <StickyNote />, count: data.notes.length },
  ];

  return (
    <Tabs defaultValue={defaultTab} className="gap-0 rounded-[10px] border bg-card">
      <TabsList variant="line" className="h-auto w-full justify-start gap-0 overflow-x-auto border-b px-2 [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className={triggerClass} title={t.label}>
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined ? <Count n={t.count} /> : null}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="p-[18px]">
        <TabsContent value="etapa">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-muted-foreground">Cambia la etapa de cada oportunidad de este cliente.</p>
            <DealDialog contactId={data.contactId} trigger={<Button size="sm" variant="outline">+ Oportunidad</Button>} />
          </div>
          {data.deals.length === 0 ? (
            <p className="text-muted-foreground">Este contacto no tiene oportunidades.</p>
          ) : (
            <ul className="grid gap-2.5">
              {data.deals.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-[9px] border p-3 [&>*]:min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">{d.title}</div>
                    <div className="text-[12.5px] text-muted-foreground tabular-nums">{formatCOP(d.value)}</div>
                  </div>
                  <StageSelect dealId={d.id} stage={d.stage} className="w-[180px] max-w-full text-foreground" />
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Eliminar oportunidad ${d.title}`} title="Eliminar">
                        <Trash2 />
                      </Button>
                    }
                    description={<>¿Eliminar la oportunidad <strong>{d.title}</strong>?</>}
                    confirmLabel="Eliminar"
                    success="Oportunidad eliminada"
                    action={() => deleteDealAction(d.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="historial">
          {data.activity.length === 0 ? (
            <p className="text-muted-foreground">Sin cambios registrados.</p>
          ) : (
            <ol className="relative ml-1.5 border-l pl-4">
              {data.activity.map((a) => (
                <li key={a.id} className="relative pb-3 last:pb-0">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-white bg-primary" aria-hidden />
                  <div className="text-[13px]">{a.text}</div>
                  <time className="text-[12px] text-muted-foreground tabular-nums">{formatDateTime(a.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="tareas">
          <NewTaskForm contactId={data.contactId} />
          <TaskList tasks={data.tasks} emptyText="Este contacto no tiene tareas." />
        </TabsContent>

        <TabsContent value="etiquetas">
          <TagsPanel contactId={data.contactId} tags={data.tags} suggestions={data.tagSuggestions} />
        </TabsContent>

        <TabsContent value="notas">
          <NotesPanel contactId={data.contactId} notes={data.notes} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
