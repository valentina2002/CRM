import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandLogo />
          <div className="text-[15px] font-bold leading-tight">
            CRM SEO
            <small className="block text-[11.5px] font-medium text-muted-foreground">Valentina · Consultoría SEO</small>
          </div>
        </div>
        <div className="rounded-[10px] border bg-card p-6">
          <h1 className="mb-1 text-lg font-bold">Iniciar sesión</h1>
          <p className="mb-5 text-muted-foreground">Entra con tu correo y contraseña.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
