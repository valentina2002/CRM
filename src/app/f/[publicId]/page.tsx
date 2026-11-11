import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { consentText, UTM_KEYS } from "@/lib/lead-form";
import { getPublicForm } from "@/lib/services/lead-forms";

export const metadata: Metadata = { title: "Contacto", robots: { index: false, follow: false } };

/** Public hosted form (link in bio, campaigns). Posts to /api/forms/{publicId}; works without JavaScript. */
export default function PublicFormPage({ params, searchParams }: PageProps<"/f/[publicId]">) {
  return (
    <main className="grid min-h-screen place-items-start bg-[#f3f5f8] px-4 py-10 sm:place-items-center">
      <Suspense fallback={<div className="mx-auto h-[520px] w-full max-w-[460px] animate-pulse rounded-[14px] border bg-card" />}>
        <PublicForm params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const inputClass =
  "mt-1 block w-full rounded-md border border-input bg-white px-3 py-2 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

async function PublicForm({ params, searchParams }: Pick<PageProps<"/f/[publicId]">, "params" | "searchParams">) {
  const { publicId } = await params;
  const sp = await searchParams;
  const form = await getPublicForm(publicId);
  // A friendly message instead of notFound(): the page streams, so a 404 thrown here would only surface as an error.
  if (!form) {
    return (
      <section className="mx-auto w-full max-w-[460px] rounded-[14px] border bg-card p-6 text-center shadow-sm">
        <p className="text-[17px] font-semibold">Este formulario no está disponible</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Puede que el enlace esté mal escrito o que el formulario se haya desactivado.</p>
      </section>
    );
  }
  const sent = sp.enviado === "1";
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;

  return (
    <section className="mx-auto w-full max-w-[460px] rounded-[14px] border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <BrandLogo />
        <div className="leading-tight">
          <strong className="block">{form.ownerName}</strong>
          <span className="text-[13px] text-muted-foreground">{form.name}</span>
        </div>
      </div>
      {sent ? (
        <div role="status" className="rounded-md bg-success-soft px-4 py-5 text-center">
          <p className="text-[17px] font-semibold text-primary">¡Mensaje enviado!</p>
          <p className="mt-1 text-[14px] text-[#2c3a4f]">{form.successMessage}</p>
        </div>
      ) : (
        <form action={`/api/forms/${form.publicId}`} method="POST" className="grid gap-3">
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-destructive">
              {error}
            </p>
          ) : null}
          <label className="text-[14px] font-medium">
            Nombre *
            <input name="name" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
          </label>
          <label className="text-[14px] font-medium">
            Empresa
            <input name="company" maxLength={160} autoComplete="organization" className={inputClass} />
          </label>
          <label className="text-[14px] font-medium">
            WhatsApp
            <input name="phone" type="tel" inputMode="tel" placeholder="300 123 4567" maxLength={40} autoComplete="tel" className={inputClass} />
          </label>
          <label className="text-[14px] font-medium">
            Correo
            <input name="email" type="email" maxLength={200} autoComplete="email" className={inputClass} />
          </label>
          <p className="-mt-1.5 text-[12.5px] text-muted-foreground">Déjanos al menos tu WhatsApp o tu correo.</p>
          <label className="text-[14px] font-medium">
            ¿En qué te puedo ayudar?
            <textarea name="message" rows={3} maxLength={2000} className={inputClass} />
          </label>
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px]" />
          {UTM_KEYS.map((k) => (typeof sp[k] === "string" ? <input key={k} type="hidden" name={k} value={(sp[k] as string).slice(0, 120)} /> : null))}
          <label className="flex items-start gap-2 text-[13px] text-[#3b475a]">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-primary" />
            {consentText(form.ownerName)}
          </label>
          <button type="submit" className="mt-1 rounded-md bg-primary px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-primary/90">
            Enviar
          </button>
        </form>
      )}
    </section>
  );
}
