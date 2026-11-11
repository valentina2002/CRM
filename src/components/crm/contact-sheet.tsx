import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { deleteContactAndLeaveAction } from "@/app/(app)/crm-actions";
import { ChannelBadge } from "@/components/conversations/channel-badge";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABEL } from "@/lib/constants";
import { formatCOP, formatDate, formatPhone, initials } from "@/lib/format";
import { getContactSheet, listAllTags } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";
import { Avatar, Card, Chip } from "./chip";
import { ConfirmDialog } from "./confirm-dialog";
import { ContactFormDialog } from "./contact-form-dialog";
import { ContactSheetTabs } from "./contact-sheet-tabs";
import { MergeContactDialog } from "./merge-contact-dialog";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Creado a mano",
  api: "API",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  app_sync: "Contactos de la app WhatsApp Business",
};

/**
 * Full contact sheet (data + Etapa/Historial/Tareas/Etiquetas/Notas). Server component; the caller
 * must have checked the session. Reused by /contactos/[id] and, in Phase 4, by the chat side panel.
 */
export async function ContactSheet({ contactId, compact = false }: { contactId: string; compact?: boolean }) {
  const [contact, allTags] = await Promise.all([getContactSheet(contactId), listAllTags()]);
  if (!contact) notFound();

  const formValues = {
    id: contact.id,
    name: contact.name,
    company: contact.company,
    phone: contact.phone,
    email: contact.email,
    service: contact.service,
    monthlyValue: contact.monthlyValue,
    tags: contact.tags,
  };

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar initials={initials(contact.name)} className={compact ? "size-10" : "size-12 text-base"} />
          <div className="min-w-0 flex-1">
            {compact ? (
              <h2 className="text-[16px] font-bold">{contact.name}</h2>
            ) : (
              <h1 className="text-[20px] font-bold tracking-[-.01em]">{contact.name}</h1>
            )}
            <div className="text-[13px] break-words text-muted-foreground">
              {[contact.company, formatPhone(contact.phone), contact.email].filter(Boolean).join(" · ")}
            </div>
            {contact.tags.length ? (
              <div className="mt-1.5">
                {contact.tags.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
            ) : null}
          </div>
          <div className={compact ? "flex w-full flex-wrap gap-2" : "flex flex-wrap gap-2"}>
            <Button asChild variant="outline" size="sm" className={compact ? "hidden" : undefined}>
              <Link href={`/conversaciones?c=${contact.id}`}>
                <MessageCircle /> Chat
                {contact.conversation?.unread ? (
                  <span className="rounded-[10px] bg-primary px-1.5 text-[11px] font-semibold text-white">{contact.conversation.unread}</span>
                ) : null}
              </Link>
            </Button>
            <ContactFormDialog
              contact={formValues}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil /> Editar
                </Button>
              }
            />
            <MergeContactDialog contactId={contact.id} contactName={contact.name} inChat={compact} />
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" aria-label="Eliminar contacto">
                  <Trash2 />
                  <span className="sr-only sm:not-sr-only">Eliminar</span>
                </Button>
              }
              description={
                <>
                  ¿Eliminar a <strong>{contact.name}</strong> y sus oportunidades, notas, tareas y conversación? Esta acción no se puede deshacer.
                </>
              }
              confirmLabel="Eliminar"
              action={deleteContactAndLeaveAction.bind(null, contact.id)}
            />
          </div>
        </div>
      </Card>

      <div className={cn("grid gap-4 [&>*]:min-w-0", !compact && "items-start lg:grid-cols-[minmax(260px,1fr)_2fr]")}>
        <Card title="Datos del cliente">
          <dl className="grid gap-2.5 text-[13.5px]">
            <Row label="Empresa">{contact.company}</Row>
            <Row label="WhatsApp">{formatPhone(contact.phone)}</Row>
            <Row label="Correo">{contact.email ? <a className="hover:text-primary hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> : null}</Row>
            <Row label="Servicio">{contact.service}</Row>
            <Row label="Valor mensual">{formatCOP(contact.monthlyValue)}</Row>
            <Row label="Canales">
              {contact.channels.length
                ? [...new Set(contact.channels.map((c) => c.channel))].map((ch) => (
                    <ChannelBadge key={ch} channel={ch} className="mr-[3px]">
                      {CHANNEL_LABEL[ch]}
                      {contact.channels.find((c) => c.channel === ch && c.handle)?.handle ? ` · ${contact.channels.find((c) => c.channel === ch && c.handle)?.handle}` : ""}
                    </ChannelBadge>
                  ))
                : null}
            </Row>
            <Row label="Cuentas de cobro">{contact._count.invoices || null}</Row>
            <Row label="Origen">{contact.source ? (SOURCE_LABEL[contact.source] ?? contact.source) : null}</Row>
            <Row label="Creado">{formatDate(contact.createdAt)}</Row>
          </dl>
        </Card>

        <ContactSheetTabs
          data={{
            contactId: contact.id,
            deals: contact.deals.map((d) => ({ id: d.id, title: d.title, value: d.value, stage: d.stage })),
            activity: contact.activity.map((a) => ({ id: a.id, text: a.text, type: a.type, createdAt: a.createdAt })),
            tasks: contact.tasks.map((t) => ({ id: t.id, text: t.text, done: t.done, dueAt: t.dueAt })),
            tags: contact.tags,
            tagSuggestions: allTags,
            notes: contact.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, updatedAt: n.updatedAt })),
          }}
        />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
