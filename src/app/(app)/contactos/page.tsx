import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Contactos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Contactos" subtitle="Tus clientes y prospectos con etiquetas, servicio y valor mensual." />
      <ComingSoon phase="Fase 1" />
    </>
  );
}
