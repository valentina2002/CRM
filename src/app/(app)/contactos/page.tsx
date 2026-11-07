import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsTable } from "@/components/crm/contacts-table";
import { PageSkeleton } from "@/components/page-skeleton";
import { listContacts } from "@/lib/services/contacts";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Contactos" };

export default function ContactosPage() {
  return (
    <Suspense fallback={<PageSkeleton title="Contactos" />}>
      <Contacts />
    </Suspense>
  );
}

async function Contacts() {
  await requireUser();
  const contacts = await listContacts();
  return (
    <ContactsTable
      contacts={contacts.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
        phone: c.phone,
        email: c.email,
        service: c.service,
        monthlyValue: c.monthlyValue,
        tags: c.tags,
        stage: c.deals[0]?.stage ?? null,
      }))}
    />
  );
}
