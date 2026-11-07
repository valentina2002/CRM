import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Pipeline de ventas" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pipeline de ventas" subtitle="Arrastra las tarjetas entre etapas (o usa el selector). Cambiar de etapa puede disparar automatizaciones." />
      <ComingSoon phase="Fase 1" />
    </>
  );
}
