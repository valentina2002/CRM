import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Chip } from "@/components/crm/chip";
import { LeadFormControls, LeadFormDialog } from "@/components/forms/lead-form-ui";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { consentText, embedSnippet } from "@/lib/lead-form";
import { getIssuer } from "@/lib/services/invoices";
import { listLeadForms } from "@/lib/services/lead-forms";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Formularios" };

export default function FormulariosPage() {
  return (
    <>
      <PageHeader
        title="Formularios"
        subtitle="Captura prospectos desde tu web o un enlace (bio de Instagram, campañas). Cada envío crea el contacto y dispara tus automatizaciones."
        actions={<LeadFormDialog trigger={<Button>+ Nuevo formulario</Button>} />}
      />
      <Suspense fallback={<PageSkeleton title="" />}>
        <Forms />
      </Suspense>
    </>
  );
}

async function Forms() {
  await requireUser();
  const [forms, issuer] = await Promise.all([listLeadForms(), getIssuer()]);
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  if (forms.length === 0) {
    return (
      <div className="rounded-[10px] border bg-card p-8 text-center text-muted-foreground">
        Todavía no tienes formularios. Crea uno y compártelo o pégalo en tu página web.
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {forms.map((f) => {
        const publicUrl = `${appUrl}/f/${f.publicId}`;
        return (
          <Card key={f.id} className={cn(!f.active && "opacity-75")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold">{f.name}</h3>
                <p className="mt-0.5 text-[12.5px] break-all text-muted-foreground">{publicUrl}</p>
                <div className="mt-1.5">
                  {f.tags.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                  {f.service ? <Chip className="bg-info-soft text-info">{f.service}</Chip> : null}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold">{f.submissions}</div>
                <div className="text-[12px] text-muted-foreground">{f.submissions === 1 ? "envío" : "envíos"}</div>
              </div>
            </div>
            <div className="mt-3">
              <LeadFormControls
                form={{ id: f.id, name: f.name, tags: f.tags, service: f.service, successMessage: f.successMessage, redirectUrl: f.redirectUrl }}
                active={f.active}
                publicUrl={publicUrl}
                embedHtml={embedSnippet(`${appUrl}/api/forms/${f.publicId}`, consentText(issuer.name))}
              />
            </div>
            {f.entries.length ? (
              <div className="mt-3 border-t pt-2.5">
                <h4 className="mb-1 text-[12.5px] font-semibold text-muted-foreground">Últimos envíos</h4>
                <ul className="grid gap-0.5 text-[13px]">
                  {f.entries.map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                      {e.contactId ? (
                        <Link href={`/contactos/${e.contactId}`} className="font-medium hover:text-primary hover:underline">
                          {e.isNew ? "Contacto nuevo" : "Contacto existente"} →
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        );
      })}
      <p className="text-[12.5px] text-muted-foreground">
        Si la persona ya existe (mismo WhatsApp o correo) no se duplica: se agrega una nota a su ficha. El formulario pide autorización para tratar los datos (Ley 1581 de
        2012) y tiene protección básica contra spam.
      </p>
    </div>
  );
}
