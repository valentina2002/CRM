import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Documentación de la API" };

export default function Page() {
  return (
    <>
      <PageHeader title="Documentación de la API" subtitle="Rutas, autenticación con API key y webhooks salientes del CRM." />
      <ComingSoon phase="Fase 5" />
    </>
  );
}
