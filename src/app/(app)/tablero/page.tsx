import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoon, PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Tablero" };

export default function TableroPage() {
  return (
    <>
      <PageHeader title="Tablero" subtitle="Resumen de tu agencia: clientes, ventas, cobros y conversaciones." />
      <ComingSoon phase="Fase 1">
        <Suspense fallback={<p className="mt-4 text-muted-foreground">Revisando la base de datos…</p>}>
          <DatabaseStatus />
        </Suspense>
      </ComingSoon>
    </>
  );
}

/** Phase 0 check: proves the DB connection and the seed. Replaced by the real KPIs in Phase 1. */
async function DatabaseStatus() {
  await requireUser();
  const counts = await Promise.all([
    db.contact.count(),
    db.deal.count(),
    db.invoice.count(),
    db.automation.count(),
    db.task.count({ where: { done: false } }),
  ]).catch(() => null);

  if (!counts) {
    return (
      <div className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-destructive">
        No hay conexión con la base de datos. Revisa DATABASE_URL en .env.local.
      </div>
    );
  }
  const [contacts, deals, invoices, automations, tasks] = counts;
  return (
    <div className="mt-4 rounded-md bg-success-soft px-3 py-2 text-[13px] text-primary">
      Base de datos conectada ({formatDate(new Date())}): {contacts} contactos · {deals} oportunidades · {invoices} cuentas de cobro ·{" "}
      {automations} automatizaciones · {tasks} tareas pendientes.
    </div>
  );
}
