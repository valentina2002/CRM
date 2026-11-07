import type { Metadata } from "next";
import { Suspense } from "react";
import { AutomationBuilder } from "@/components/automations/automation-builder";
import { AutomationCard } from "@/components/automations/automation-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { parseActions } from "@/lib/automation-engine";
import { listAutomations } from "@/lib/services/automations";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Automatizaciones" };

export default function AutomatizacionesPage() {
  return (
    <Suspense fallback={<PageSkeleton title="Automatizaciones" />}>
      <Automations />
    </Suspense>
  );
}

async function Automations() {
  await requireUser();
  const automations = await listAutomations();
  return (
    <>
      <PageHeader
        title="Automatizaciones"
        subtitle="Flujos “cuando pase X → haz Y”. Se ejecutan al instante cuando ocurre el evento en Contactos, Pipeline o Cuentas de cobro."
        actions={<AutomationBuilder trigger={<Button>+ Nueva automatización</Button>} />}
      />
      {automations.length === 0 ? (
        <div className="rounded-[10px] border bg-card p-8 text-center text-muted-foreground">Todavía no tienes automatizaciones.</div>
      ) : (
        <div className="grid gap-4">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={{
                id: a.id,
                name: a.name,
                trigger: a.trigger,
                condition: a.condition,
                actions: parseActions(a.actions),
                active: a.active,
                runCount: a.runCount,
                lastRun: a.runs[0] ?? null,
              }}
            />
          ))}
        </div>
      )}
      <p className="mt-3.5 text-[12.5px] text-muted-foreground">
        Variables disponibles en los mensajes: <code className="rounded bg-secondary px-1">{"{nombre}"}</code> <code className="rounded bg-secondary px-1">{"{empresa}"}</code>{" "}
        <code className="rounded bg-secondary px-1">{"{factura}"}</code> <code className="rounded bg-secondary px-1">{"{valor}"}</code>. Los mensajes de WhatsApp quedan en cola en la
        conversación hasta conectar WhatsApp (Fase 4). “Llega un mensaje” empezará a dispararse en la Fase 4.
      </p>
    </>
  );
}
