"use client";

import { Copy, Pencil, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { checkOverdueAction, deleteInvoiceAction, duplicateInvoiceAction, sendInvoiceAction } from "@/app/(app)/cuentas-de-cobro/actions";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { useAction } from "@/components/crm/use-action";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { InvoiceEditorDialog, type EditableInvoice } from "./invoice-editor-dialog";
import { PayDialog } from "./pay-dialog";

type ContactOption = { id: string; name: string; company: string | null };

export function SendWhatsAppButton({ invoiceId, number, size = "sm" }: { invoiceId: string; number: string; size?: "sm" | "default" }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() =>
        run(() => sendInvoiceAction(invoiceId, "whatsapp"), {
          onSuccess: (data) =>
            data?.whatsappConnected
              ? toast.success(`Enviando ${number} por WhatsApp (texto + PDF). Mira el estado en Conversaciones.`)
              : toast(`${number} quedó en cola en la conversación: se enviará cuando conectes WhatsApp en Ajustes.`),
        })
      }
    >
      <Send /> {pending ? "Enviando…" : "Enviar por WhatsApp"}
    </Button>
  );
}

export function MarkSentButton({ invoiceId, number }: { invoiceId: string; number: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => sendInvoiceAction(invoiceId, "manual"), { success: `${number} marcada como enviada` })}>
      Marcar como enviada
    </Button>
  );
}

export function DuplicateButton({ invoiceId, number, iconOnly = false }: { invoiceId: string; number: string; iconOnly?: boolean }) {
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <Button
      variant={iconOnly ? "ghost" : "outline"}
      size={iconOnly ? "icon-sm" : "sm"}
      title="Duplicar para el mes siguiente"
      aria-label={`Duplicar ${number}`}
      disabled={pending}
      onClick={() =>
        run(() => duplicateInvoiceAction(invoiceId), {
          success: `Borrador creado a partir de ${number}`,
          onSuccess: (data) => router.push(`/cuentas-de-cobro/${data.id}`),
        })
      }
    >
      <Copy />
      {iconOnly ? null : "Duplicar"}
    </Button>
  );
}

export function CheckOverdueButton() {
  const { pending, run } = useAction();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(checkOverdueAction, {
          onSuccess: (numbers) => {
            if (numbers.length) toast.success(`Vencidas: ${numbers.join(", ")}`);
            else toast("No hay cuentas pendientes vencidas");
          },
        })
      }
    >
      {pending ? "Revisando…" : "Revisar vencimientos"}
    </Button>
  );
}

/** Buttons on each row of the list. */
export function InvoiceRowActions({
  invoice,
  status,
  total,
  contacts,
}: {
  invoice: EditableInvoice;
  status: InvoiceStatus;
  total: number;
  contacts: ContactOption[];
}) {
  const paid = status === "PAID";
  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      {!paid ? (
        <>
          <SendWhatsAppButton invoiceId={invoice.id} number={invoice.number} />
          <PayDialog invoiceId={invoice.id} number={invoice.number} total={total} trigger={<Button size="sm">Marcar pagada</Button>} />
          <InvoiceEditorDialog
            invoice={invoice}
            contacts={contacts}
            trigger={
              <Button variant="ghost" size="icon-sm" title="Editar" aria-label={`Editar ${invoice.number}`}>
                <Pencil />
              </Button>
            }
          />
        </>
      ) : null}
      <DuplicateButton invoiceId={invoice.id} number={invoice.number} iconOnly />
      {status === "DRAFT" ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-sm" title="Eliminar borrador" aria-label={`Eliminar ${invoice.number}`}>
              <Trash2 />
            </Button>
          }
          description={<>¿Eliminar el borrador <strong>{invoice.number}</strong>?</>}
          confirmLabel="Eliminar"
          success="Borrador eliminado"
          action={() => deleteInvoiceAction(invoice.id)}
        />
      ) : null}
    </div>
  );
}
