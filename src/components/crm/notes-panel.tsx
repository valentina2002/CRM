"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { addNoteAction, deleteNoteAction, updateNoteAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog } from "./confirm-dialog";
import { useAction } from "./use-action";

export type NoteItem = { id: string; body: string; createdAt: Date; updatedAt: Date };

export function NotesPanel({ contactId, notes }: { contactId: string; notes: NoteItem[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, run } = useAction();

  return (
    <div>
      <form
        ref={formRef}
        className="mb-4 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = new FormData(e.currentTarget).get("body");
          run(() => addNoteAction({ contactId, body }), { success: "Nota guardada", onSuccess: () => formRef.current?.reset() });
        }}
      >
        <Textarea name="body" rows={3} placeholder="Escribe una nota (llamadas, acuerdos, accesos pendientes…)" aria-label="Nueva nota" maxLength={5000} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Guardando…" : "Guardar nota"}
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay notas.</p>
      ) : (
        <ul className="grid gap-2.5">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteCard({ note }: { note: NoteItem }) {
  const [editing, setEditing] = useState(false);
  const { pending, run } = useAction();
  const edited = note.updatedAt.getTime() - note.createdAt.getTime() > 1000;

  return (
    <li className="rounded-lg border bg-[#fffdf5] p-3">
      <div className="mb-1 flex items-center gap-1 text-[12px] text-muted-foreground">
        <span className="flex-1">
          {formatDateTime(note.createdAt)}
          {edited ? " · editada" : ""}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Editar nota" title="Editar" onClick={() => setEditing((v) => !v)}>
          <Pencil />
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-xs" aria-label="Eliminar nota" title="Eliminar">
              <Trash2 />
            </Button>
          }
          description="¿Eliminar esta nota? No se puede deshacer."
          confirmLabel="Eliminar"
          success="Nota eliminada"
          action={() => deleteNoteAction(note.id)}
        />
      </div>
      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = String(new FormData(e.currentTarget).get("body") ?? "");
            run(() => updateNoteAction(note.id, body), { success: "Nota actualizada", onSuccess: () => setEditing(false) });
          }}
        >
          <Textarea name="body" rows={3} defaultValue={note.body} aria-label="Editar nota" autoFocus maxLength={5000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Guardar
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words">{note.body}</p>
      )}
    </li>
  );
}
