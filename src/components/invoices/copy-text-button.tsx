"use client";

import { ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyTextButton({ text }: { text: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast.success("Texto copiado"),
          () => toast.error("No se pudo copiar"),
        )
      }
    >
      <ClipboardCopy /> Copiar texto
    </Button>
  );
}
