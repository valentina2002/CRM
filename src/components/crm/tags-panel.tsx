"use client";

import { X } from "lucide-react";
import { useRef } from "react";
import { addTagAction, removeTagAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "./chip";
import { useAction } from "./use-action";

export function TagsPanel({ contactId, tags, suggestions }: { contactId: string; tags: string[]; suggestions: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, run } = useAction();
  const lower = tags.map((t) => t.toLocaleLowerCase("es-CO"));
  const available = suggestions.filter((s) => !lower.includes(s.toLocaleLowerCase("es-CO")));

  const add = (tag: string) => run(() => addTagAction({ contactId, tag }), { onSuccess: () => formRef.current?.reset() });

  return (
    <div>
      <div className="mb-4 flex min-h-8 flex-wrap items-center gap-1">
        {tags.length === 0 ? <span className="text-muted-foreground">Sin etiquetas.</span> : null}
        {tags.map((t) => (
          <Chip key={t} className="py-1 pr-1 text-[12.5px]">
            {t}
            <button
              type="button"
              className="grid size-4 cursor-pointer place-items-center rounded-full hover:bg-black/10"
              aria-label={`Quitar etiqueta ${t}`}
              disabled={pending}
              onClick={() => run(() => removeTagAction(contactId, t))}
            >
              <X className="size-3" />
            </button>
          </Chip>
        ))}
      </div>
      <form
        ref={formRef}
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const tag = String(new FormData(e.currentTarget).get("tag") ?? "").trim();
          if (tag) add(tag);
        }}
      >
        <Input name="tag" placeholder="Nueva etiqueta" aria-label="Nueva etiqueta" list="tag-suggestions" maxLength={40} className="max-w-xs" />
        <datalist id="tag-suggestions">
          {available.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" disabled={pending}>
          Agregar
        </Button>
      </form>
      {available.length > 0 ? (
        <div className="mt-3 text-[12.5px] text-muted-foreground">
          Usadas en otros contactos:{" "}
          {available.slice(0, 12).map((s) => (
            <button key={s} type="button" className="cursor-pointer" onClick={() => add(s)} disabled={pending}>
              <Chip className="hover:bg-[#e3e7ee]">+ {s}</Chip>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
