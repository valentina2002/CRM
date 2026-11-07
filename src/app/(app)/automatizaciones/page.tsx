import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Automatizaciones" };

export default function Page() {
  return (
    <>
      <PageHeader title="Automatizaciones" subtitle="Flujos “cuando pase X → haz Y”." />
      <ComingSoon phase="Fase 3" />
    </>
  );
}
