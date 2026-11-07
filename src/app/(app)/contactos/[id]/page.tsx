import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ContactSheet } from "@/components/crm/contact-sheet";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Ficha del cliente" };

export default function ContactPage({ params }: PageProps<"/contactos/[id]">) {
  return (
    <>
      <Link href="/contactos" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Contactos
      </Link>
      <Suspense fallback={<PageSkeleton title="Ficha del cliente" />}>
        <Sheet params={params} />
      </Suspense>
    </>
  );
}

async function Sheet({ params }: { params: PageProps<"/contactos/[id]">["params"] }) {
  await requireUser();
  const { id } = await params;
  return <ContactSheet contactId={id} />;
}
