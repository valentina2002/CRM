"use client";

import { Merge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { listMergeTargetsAction, mergeContactsAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "./use-action";

type Option = { id: string; name: string; company: string | null };

/**
 * "Fusionar": joins this contact into another one (same person on two channels). `inChat` keeps the user in
 * the inbox after merging; otherwise they land on the merged contact's sheet.
 */
export function MergeContactDialog({ contactId, contactName, inChat = false }: { contactId: string; contactName: string; inChat?: boolean }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const router = useRouter();
  const chosen = options?.find((o) => o.id === target);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
        if (next && !options) listMergeTargetsAction(contactId).then(setOptions, () => setError("No se pudieron cargar los contactos"));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Merge /> Fusionar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fusionar contacto</DialogTitle>
          <DialogDescription>
            Úsalo cuando <strong>{contactName}</strong> es la misma persona que otro contacto (por ejemplo, un cliente que ahora te escribió por Instagram).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-[13px] font-semibold" htmlFor="merge_target">
            Unir a {contactName} con
            {options ? (
              <NativeSelect id="merge_target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Elige el contacto que se conserva…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.company ? ` · ${o.company}` : ""}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <span className="font-normal text-muted-foreground">Cargando contactos…</span>
            )}
          </label>
          <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            Los mensajes, canales, oportunidades, tareas, notas, historial y cuentas de cobro de {contactName} pasan a {chosen ? <strong>{chosen.name}</strong> : "ese contacto"}, y{" "}
            <strong>{contactName} deja de existir</strong>. No se puede deshacer.
          </p>
          {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            disabled={!target || pending}
            onClick={() =>
              run(() => mergeContactsAction(contactId, target), {
                success: "Contactos fusionados",
                onError: setError,
                onSuccess: (merged) => {
                  setOpen(false);
                  router.replace(inChat ? `/conversaciones?c=${merged.id}` : `/contactos/${merged.id}`);
                },
              })
            }
          >
            {pending ? "Fusionando…" : "Fusionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
