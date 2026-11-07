import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "WhatsApp y API" };

export default function Page() {
  return (
    <>
      <PageHeader title="WhatsApp y API" subtitle="Conecta tu número con coexistencia y expón tu propia API para integrar otras herramientas." />
      <ComingSoon phase="Fase 4 (WhatsApp) y la Fase 5 (API)" />
    </>
  );
}
