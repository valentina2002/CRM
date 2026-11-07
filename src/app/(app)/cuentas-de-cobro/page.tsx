import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Cuentas de cobro" };

export default function Page() {
  return (
    <>
      <PageHeader title="Cuentas de cobro" subtitle="Crea, envía por WhatsApp y registra el pago de tus cuentas de cobro mensuales." />
      <ComingSoon phase="Fase 2" />
    </>
  );
}
