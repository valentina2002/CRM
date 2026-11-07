import type { Metadata } from "next";
import { Suspense } from "react";
import { DealDialog } from "@/components/crm/deal-dialog";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { listContactOptions } from "@/lib/services/contacts";
import { listBoardDeals } from "@/lib/services/deals";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <Suspense fallback={<PageSkeleton title="Pipeline de ventas" />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  await requireUser();
  const [deals, contacts] = await Promise.all([listBoardDeals(), listContactOptions()]);
  return (
    <>
      <PageHeader
        title="Pipeline de ventas"
        subtitle="Arrastra las tarjetas entre etapas (o usa el selector). Cambiar de etapa puede disparar automatizaciones."
        actions={<DealDialog contacts={contacts} trigger={<Button>+ Nueva oportunidad</Button>} />}
      />
      <PipelineBoard
        deals={deals.map((d) => ({ id: d.id, title: d.title, value: d.value, stage: d.stage, contact: d.contact }))}
      />
    </>
  );
}
