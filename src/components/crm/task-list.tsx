"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useRef, startTransition } from "react";
import { createTaskAction, deleteTaskAction, toggleTaskAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDay, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAction } from "./use-action";

export type TaskItem = {
  id: string;
  text: string;
  done: boolean;
  dueAt: Date | null;
  contact?: { id: string; name: string } | null;
};

/** Checklist of tasks (toggle with optimistic UI, delete). Used in the dashboard and the contact sheet. */
export function TaskList({ tasks, showContact = false, emptyText = "Sin tareas." }: { tasks: TaskItem[]; showContact?: boolean; emptyText?: string }) {
  const [optimistic, setDone] = useOptimistic(tasks, (state, id: string) => state.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const { run } = useAction();
  const today = todayISO();

  if (optimistic.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;

  return (
    <ul>
      {optimistic.map((t) => {
        const due = t.dueAt ? t.dueAt.toISOString().slice(0, 10) : null;
        const late = !t.done && due !== null && due < today;
        return (
          <li key={t.id} className="group flex items-start gap-2.5 border-b py-[7px] last:border-b-0">
            <input
              type="checkbox"
              checked={t.done}
              aria-label={t.done ? `Reabrir: ${t.text}` : `Completar: ${t.text}`}
              className="mt-[3px] size-4 cursor-pointer accent-primary"
              onChange={() =>
                startTransition(async () => {
                  setDone(t.id);
                  const result = await toggleTaskAction(t.id);
                  if (!result.ok) toast.error(result.error);
                })
              }
            />
            <div className="min-w-0 flex-1">
              <span className={cn(t.done && "text-muted-foreground line-through")}>{t.text}</span>
              {(showContact && t.contact) || due ? (
                <div className="text-[12px] text-muted-foreground">
                  {showContact && t.contact ? (
                    <Link href={`/contactos/${t.contact.id}`} className="hover:text-primary hover:underline">
                      {t.contact.name}
                    </Link>
                  ) : null}
                  {showContact && t.contact && due ? " · " : null}
                  {due ? <span className={cn(late && "font-semibold text-destructive")}>vence {formatDay(due)}</span> : null}
                </div>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-60 group-hover:opacity-100"
              aria-label={`Eliminar tarea: ${t.text}`}
              title="Eliminar"
              onClick={() => run(() => deleteTaskAction(t.id), { success: "Tarea eliminada" })}
            >
              <Trash2 />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function NewTaskForm({ contactId }: { contactId?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, run } = useAction();

  return (
    <form
      ref={formRef}
      className="mb-3 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        run(() => createTaskAction({ text: form.get("text"), dueAt: form.get("dueAt"), contactId: contactId ?? null }), {
          success: "Tarea creada",
          onSuccess: () => formRef.current?.reset(),
        });
      }}
    >
      <Input name="text" placeholder="Nueva tarea…" aria-label="Nueva tarea" className="min-w-0 flex-1 basis-48" maxLength={300} />
      <Input name="dueAt" type="date" aria-label="Fecha límite (opcional)" className="w-[150px]" />
      <Button type="submit" variant="outline" disabled={pending}>
        Agregar
      </Button>
    </form>
  );
}
