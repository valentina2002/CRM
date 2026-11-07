"use client";

import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { deleteContactAction } from "@/app/(app)/crm-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Stage } from "@/generated/prisma/enums";
import { formatCOP, formatPhone } from "@/lib/format";
import { Chip, StageChip } from "./chip";
import { ConfirmDialog } from "./confirm-dialog";
import { ContactFormDialog, type ContactFormValues } from "./contact-form-dialog";

export type ContactRow = ContactFormValues & { stage: Stage | null };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const [query, setQuery] = useState("");
  const q = fold(useDeferredValue(query).trim());
  const qDigits = q.replace(/\D/g, "");

  const list = contacts.filter((c) => {
    if (!q) return true;
    const haystack = fold([c.name, c.company, c.email, c.tags.join(" "), formatPhone(c.phone)].join(" "));
    return haystack.includes(q) || (qDigits.length >= 3 && (c.phone ?? "").includes(qDigits));
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-.01em]">Contactos</h1>
          <p className="mt-[3px] text-muted-foreground">Tus clientes y prospectos con etiquetas, servicio y valor mensual.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nombre, empresa, etiqueta…"
            aria-label="Buscar contactos"
            className="min-w-0 flex-1 bg-white sm:w-[280px] sm:flex-none"
          />
          <ContactFormDialog openAfterCreate trigger={<Button>+ Nuevo contacto</Button>} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border bg-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b bg-[#fafbfc] text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">Nombre</th>
              <th className="px-3 py-2.5 font-semibold">Contacto</th>
              <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Servicio</th>
              <th className="px-3 py-2.5 font-semibold">Etapa</th>
              <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Etiquetas</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Valor/mes</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {contacts.length === 0 ? "Todavía no tienes contactos. Crea el primero." : "No hay contactos que coincidan."}
                </td>
              </tr>
            ) : (
              list.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-[#fafbfc]">
                  <td className="px-3 py-[11px] align-middle">
                    <Link href={`/contactos/${c.id}`} className="font-semibold hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-[12.5px] text-muted-foreground">{c.company}</div>
                  </td>
                  <td className="px-3 py-[11px] align-middle whitespace-nowrap">
                    {formatPhone(c.phone)}
                    <div className="text-[12.5px] text-muted-foreground">{c.email}</div>
                  </td>
                  <td className="hidden px-3 py-[11px] align-middle md:table-cell">{c.service}</td>
                  <td className="px-3 py-[11px] align-middle">{c.stage ? <StageChip stage={c.stage} /> : null}</td>
                  <td className="hidden px-3 py-[11px] align-middle lg:table-cell">
                    {c.tags.map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </td>
                  <td className="px-3 py-[11px] align-middle tabular-nums whitespace-nowrap">{formatCOP(c.monthlyValue)}</td>
                  <td className="px-3 py-[11px] text-right align-middle whitespace-nowrap">
                    <Button asChild variant="outline" size="sm" className="mr-1">
                      <Link href={`/conversaciones?c=${c.id}`}>
                        <MessageCircle /> Chat
                      </Link>
                    </Button>
                    <ContactFormDialog
                      contact={c}
                      trigger={
                        <Button variant="ghost" size="icon-sm" title="Editar" aria-label={`Editar ${c.name}`}>
                          <Pencil />
                        </Button>
                      }
                    />
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" title="Eliminar" aria-label={`Eliminar ${c.name}`}>
                          <Trash2 />
                        </Button>
                      }
                      description={
                        <>
                          ¿Eliminar a <strong>{c.name}</strong> y sus oportunidades, notas, tareas y conversación? Esta acción no se puede deshacer.
                        </>
                      }
                      confirmLabel="Eliminar"
                      success="Contacto eliminado"
                      action={() => deleteContactAction(c.id)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        {list.length} de {contacts.length} contacto{contacts.length === 1 ? "" : "s"}
      </p>
    </>
  );
}
