"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useAction } from "./use-action";

type Props = {
  trigger: ReactNode;
  title?: string;
  description: ReactNode;
  confirmLabel: string;
  action: () => Promise<ActionResult<unknown>>;
  success?: string;
  onDone?: () => void;
};

/** "¿Seguro?" dialog that runs a server action and stays open (showing the error) if it fails. */
export function ConfirmDialog({ trigger, title = "Confirmar", description, confirmLabel, action, success, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(action, {
                success,
                onSuccess: () => {
                  setOpen(false);
                  onDone?.();
                },
              })
            }
          >
            {pending ? "Un momento…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
