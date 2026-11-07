import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Conversaciones" };

export default function Page() {
  return (
    <>
      <PageHeader title="Conversaciones" subtitle="Bandeja de WhatsApp. Con coexistencia, lo que respondas desde el celular también aparece aquí." />
      <ComingSoon phase="Fase 4" />
    </>
  );
}
