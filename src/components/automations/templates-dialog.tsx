"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { applyTemplateAction } from "@/app/(app)/automatizaciones/actions";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { describeAction } from "@/lib/automation-engine";
import { AUTOMATION_TEMPLATES } from "@/lib/automation-templates";
import { ACTION_LABEL, TRIGGER_LABEL } from "@/lib/constants";

export function TemplatesDialog() {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles /> Usar una plantilla
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Plantillas de automatización</DialogTitle>
          <DialogDescription>Flujos listos para usar. Después de crearlos puedes editar los mensajes y los tiempos.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {AUTOMATION_TEMPLATES.map((t) => (
            <li key={t.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <strong>{t.title}</strong>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{t.description}</p>
                </div>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => applyTemplateAction(t.key), {
                      onSuccess: (data) => {
                        setOpen(false);
                        toast.success(data.active ? `“${t.title}” creada y activa` : `“${t.title}” creada en pausa: edítala y actívala`);
                      },
                    })
                  }
                >
                  Usar
                </Button>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                <strong>Cuando:</strong> {TRIGGER_LABEL[t.automation.trigger]} →{" "}
                {t.automation.actions.map((a) => `${ACTION_LABEL[a.type]}${a.type === "wait" || a.type === "wait_due" || a.type === "stop_if" ? ` (${describeAction(a)})` : ""}`).join(" → ")}
              </p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
