import { UserRound, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar, Chip } from "@/components/crm/chip";
import { ContactSheet } from "@/components/crm/contact-sheet";
import { ChannelBadge, ChannelMark } from "@/components/conversations/channel-badge";
import { Composer } from "@/components/conversations/composer";
import { AutoRefresh, ConversationList, MarkRead, MessageThread } from "@/components/conversations/inbox-client";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { firstName, formatPhone, initials } from "@/lib/format";
import { getThread, listConversations, simulatorEnabled } from "@/lib/services/conversations";
import { listQuickReplies } from "@/lib/services/quick-replies";
import { getSocialAccounts } from "@/lib/services/social-account";
import { getWhatsAppAccount } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversaciones" };

export default function ConversacionesPage({ searchParams }: PageProps<"/conversaciones">) {
  return (
    <>
      <PageHeader
        title="Conversaciones"
        subtitle="WhatsApp, Facebook e Instagram en un solo hilo por cliente. Lo que respondas desde el celular también aparece aquí."
        actions={
          <Button asChild variant="outline">
            <Link href="/ajustes">Configurar canales</Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton title="" />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/conversaciones">["searchParams"] }) {
  await requireUser();
  const sp = await searchParams;
  const requested = typeof sp.c === "string" ? sp.c : undefined;
  const sheetOpen = sp.ficha === "1";
  const [items, account, social, quickReplies] = await Promise.all([listConversations(requested), getWhatsAppAccount(), getSocialAccounts(), listQuickReplies()]);
  const connected = { WHATSAPP: Boolean(account), FACEBOOK: Boolean(social.facebook), INSTAGRAM: Boolean(social.instagram), TIKTOK: false };
  const activeId = requested ?? items[0]?.contactId ?? null;
  const thread = activeId ? await getThread(activeId) : null;

  const coexBadge = account
    ? account.coexistence
      ? { text: "● Coexistencia activa: celular + CRM", on: true }
      : { text: "● WhatsApp conectado (solo API)", on: true }
    : { text: "○ WhatsApp sin conectar", on: false };

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-[10px] border bg-card md:h-[calc(100vh-150px)] md:min-h-[520px] md:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_400px]">
      <AutoRefresh />
      <ConversationList items={items} activeId={activeId} />

      {thread ? (
        <>
          <MarkRead contactId={thread.contact.id} unread={thread.conversation?.unread ?? 0} />
          <section className="flex min-h-0 min-w-0 flex-col" aria-label={`Conversación con ${thread.contact.name}`}>
            <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
              <Avatar initials={initials(thread.contact.name)} />
              <div className="min-w-0">
                <div className="font-semibold">
                  <Link href={`/contactos/${thread.contact.id}`} className="hover:text-primary hover:underline">
                    {thread.contact.name}
                  </Link>
                  {thread.contact.company ? <span className="text-[12.5px] font-normal text-muted-foreground"> · {thread.contact.company}</span> : null}
                </div>
                <div className="text-[12.5px] text-muted-foreground">
                  {formatPhone(thread.contact.phone)}{" "}
                  {thread.channels
                    .filter((c) => c.channel !== "WHATSAPP")
                    .map((c) => (
                      <ChannelBadge key={c.channel} channel={c.channel} className="mr-[3px]">
                        {c.handle ?? c.label}
                      </ChannelBadge>
                    ))}
                  {thread.contact.tags.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", coexBadge.on ? "bg-success-soft text-primary" : "bg-secondary text-muted-foreground")}>
                  {coexBadge.text}
                </span>
                {thread.channels.map((c) => (
                  <span
                    key={c.channel}
                    className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", c.windowOpen ? "bg-info-soft text-info" : "bg-warning-soft text-warning")}
                  >
                    {thread.channels.length > 1 ? <ChannelMark channel={c.channel} /> : null}
                    {c.windowOpen ? "Ventana 24 h abierta" : "Ventana 24 h cerrada"}
                  </span>
                ))}
                <Button asChild variant="outline" size="sm" className="xl:hidden">
                  <Link href={`/conversaciones?c=${thread.contact.id}&ficha=1`} scroll={false}>
                    <UserRound /> Ficha
                  </Link>
                </Button>
              </div>
            </header>

            <div className="min-h-[340px] flex-1 overflow-y-auto bg-[#f0ece4] p-[18px] md:min-h-0">
              <MessageThread
                messages={thread.messages.map((m) => ({
                  id: m.id,
                  channel: m.channel,
                  direction: m.direction,
                  via: m.via,
                  status: m.status,
                  body: m.body,
                  error: m.error,
                  sentAt: m.sentAt,
                  edited: Boolean((m.meta as { edited?: boolean } | null)?.edited),
                }))}
              />
            </div>

            <Composer
              contactId={thread.contact.id}
              firstName={firstName(thread.contact.name)}
              company={thread.contact.company ?? ""}
              channels={thread.channels.map((c) => ({ ...c, connected: connected[c.channel] }))}
              defaultChannel={thread.defaultChannel}
              quickReplies={quickReplies}
              simulator={simulatorEnabled()}
            />
          </section>

          {/* Contact sheet: 3rd column on wide screens; full-screen panel on smaller ones (?ficha=1). */}
          <aside
            aria-label="Ficha del cliente"
            className={cn(
              "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto border-l bg-background p-3 xl:block",
              sheetOpen ? "max-xl:fixed max-xl:inset-0 max-xl:z-50 max-xl:block max-xl:p-4" : "hidden",
            )}
          >
            <div className="mb-2 flex justify-end xl:hidden">
              <Button asChild variant="outline" size="sm">
                <Link href={`/conversaciones?c=${thread.contact.id}`} scroll={false}>
                  <X /> Cerrar ficha
                </Link>
              </Button>
            </div>
            <Suspense fallback={<p className="p-4 text-muted-foreground">Cargando ficha…</p>}>
              <ContactSheet contactId={thread.contact.id} compact />
            </Suspense>
          </aside>
        </>
      ) : (
        <p className="p-8 text-muted-foreground">Selecciona una conversación.</p>
      )}
    </div>
  );
}

