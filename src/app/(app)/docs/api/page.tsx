import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/crm/chip";
import { PageHeader } from "@/components/page-header";
import { ApiPlayground } from "@/components/settings/api-playground";
import { MethodBadge } from "@/components/settings/method-badge";
import { loadApiDoc } from "@/lib/api/openapi-file";
import { rateLimitPerMinute } from "@/lib/api/rate-limit";
import type { DocOperation } from "@/lib/api/openapi-doc";
import { WEBHOOK_EVENT_LABEL, WEBHOOK_EVENTS } from "@/lib/webhooks/outgoing";

export const metadata: Metadata = { title: "Documentación de la API" };

const VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody: el body tal como llegó (texto), antes de JSON.parse
export function isFromCrm(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`;

const ERRORS: [string, string][] = [
  ["400", "El body no es un objeto JSON válido."],
  ["401", "Falta la API key, no es válida o fue revocada."],
  ["404", "El contacto, la oportunidad o la cuenta de cobro no existe."],
  ["409", "Conflicto: WhatsApp duplicado, ya pagada, WhatsApp no conectado o ventana de 24 h cerrada."],
  ["422", "Datos inválidos. `error` trae el primero y `details` todos, campo por campo."],
  ["429", "Pasaste el límite por minuto. Espera los segundos de `Retry-After`."],
  ["502", "Meta rechazó el mensaje de WhatsApp (el motivo va en `error`)."],
];

/** Rendered from docs/openapi.yaml (the contract), so the page and the API never drift apart. */
export default async function Page() {
  const doc = await loadApiDoc();
  const baseUrl = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/v1`;

  return (
    <>
      <PageHeader title="Documentación de la API" subtitle="Rutas, autenticación con API key y webhooks salientes del CRM." />

      <div className="grid grid-cols-1 gap-4">
        <Card title="Cómo empezar">
          <ol className="grid list-decimal gap-1.5 pl-5 text-[13.5px] break-words [&_code]:break-all">
            <li>
              Crea una API key en{" "}
              <Link href="/ajustes" className="font-semibold text-info hover:underline">
                Ajustes → WhatsApp y API
              </Link>{" "}
              (se muestra una sola vez).
            </li>
            <li>
              Envía cada petición a <code className="break-all">{baseUrl}</code> con el header <code>Authorization: Bearer &lt;API key&gt;</code>.
            </li>
            <li>
              Respuestas en JSON: <code>{"{ data }"}</code> si todo sale bien, <code>{"{ error }"}</code> si no. Fechas en ISO 8601; valores en pesos (COP) enteros.
            </li>
            <li>
              Límite: {rateLimitPerMinute()} peticiones por minuto por key (headers <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>X-RateLimit-Reset</code>).
            </li>
            <li>Lo que crees o cambies por la API dispara las mismas automatizaciones y webhooks que la interfaz.</li>
          </ol>
          <pre className="mt-3 overflow-x-auto rounded-md bg-[#0f1b2d] p-3 font-mono text-[12px] text-[#d7e3f4]">{`curl "${baseUrl}/contacts?q=seo" \\\n  -H "Authorization: Bearer crm_tu_api_key"`}</pre>
        </Card>

        <Card title="Errores">
          <table className="w-full text-[13px]">
            <tbody>
              {ERRORS.map(([code, text]) => (
                <tr key={code} className="border-b last:border-b-0">
                  <td className="w-14 py-1.5 align-top font-mono font-bold">{code}</td>
                  <td className="py-1.5 text-muted-foreground">
                    <Inline text={text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <nav aria-label="Rutas" className="rounded-[10px] border bg-card p-[18px]">
          <h3 className="mb-2 text-[14.5px] font-semibold">Rutas</h3>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {doc.groups.map((g) => (
              <div key={g.tag}>
                <h4 className="mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{g.tag}</h4>
                <ul className="grid gap-1">
                  {g.operations.map((op) => (
                    <li key={op.id}>
                      <a href={`#${op.id}`} className="flex items-center gap-2 text-[13px] hover:underline">
                        <MethodBadge method={op.method} />
                        <code className="break-all">{op.path}</code>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {doc.groups.map((g) => (
          <section key={g.tag} className="grid grid-cols-1 gap-3">
            <h2 className="mt-2 text-[17px] font-bold">{g.tag}</h2>
            {g.operations.map((op) => (
              <Operation key={op.id} op={op} />
            ))}
          </section>
        ))}

        <section className="grid grid-cols-1 gap-3" id="webhooks">
          <h2 className="mt-2 text-[17px] font-bold">Webhooks salientes</h2>
          <Card>
            <p className="text-[13.5px] break-words whitespace-pre-line">
              <Inline text={doc.webhook?.description ?? ""} />
            </p>
            <h4 className="mt-3 mb-1 text-[13px] font-semibold">Eventos</h4>
            <ul className="grid gap-0.5 text-[13px]">
              {WEBHOOK_EVENTS.map((e) => (
                <li key={e}>
                  <code>{e}</code> <span className="text-muted-foreground">· {WEBHOOK_EVENT_LABEL[e]}</span>
                </li>
              ))}
              <li>
                <code>ping</code> <span className="text-muted-foreground">· Prueba manual desde Ajustes</span>
              </li>
            </ul>
            {doc.webhook?.example ? (
              <>
                <h4 className="mt-3 mb-1 text-[13px] font-semibold">Ejemplo de body</h4>
                <pre className="overflow-x-auto rounded-md bg-[#0f1b2d] p-3 font-mono text-[12px] text-[#d7e3f4]">{doc.webhook.example}</pre>
              </>
            ) : null}
            <h4 className="mt-3 mb-1 text-[13px] font-semibold">Verificar la firma (Node.js)</h4>
            <pre className="overflow-x-auto rounded-md bg-[#0f1b2d] p-3 font-mono text-[12px] text-[#d7e3f4]">{VERIFY_SNIPPET}</pre>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-3" id="probar">
          <h2 className="mt-2 text-[17px] font-bold">Probar la API</h2>
          <Card>
            <ApiPlayground baseUrl={baseUrl} />
          </Card>
        </section>

        <p className="text-[12.5px] text-muted-foreground">
          Contrato completo en <code>docs/openapi.yaml</code> (OpenAPI {doc.version ? `· versión ${doc.version}` : ""}). Puedes importarlo en Postman o Insomnia.
        </p>
      </div>
    </>
  );
}

function Operation({ op }: { op: DocOperation }) {
  return (
    <article id={op.id} className="scroll-mt-4 rounded-[10px] border bg-card p-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={op.method} />
        <code className="text-[13.5px] font-semibold break-all">{op.path}</code>
      </div>
      <p className="mt-1.5 font-semibold">{op.summary}</p>
      {op.description ? (
        <p className="mt-1 text-[13px] break-words whitespace-pre-line text-muted-foreground">
          <Inline text={op.description} />
        </p>
      ) : null}

      {op.params.length ? (
        <>
          <h4 className="mt-3 mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Parámetros</h4>
          <ul className="grid gap-1 text-[13px]">
            {op.params.map((p) => (
              <li key={p.in + p.name}>
                <code className="font-semibold">{p.name}</code> <span className="text-muted-foreground">({p.in === "path" ? "en la ruta" : "query"} · {p.type}{p.required ? " · obligatorio" : ""})</span>
                {p.description ? (
                  <span className="text-muted-foreground">
                    {" "}
                    — <Inline text={p.description} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {op.requestExample ? (
        <>
          <h4 className="mt-3 mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Body{op.bodyRequired ? "" : " (opcional)"}</h4>
          <pre className="overflow-x-auto rounded-md bg-[#0f1b2d] p-3 font-mono text-[12px] text-[#d7e3f4]">{op.requestExample}</pre>
        </>
      ) : null}

      <h4 className="mt-3 mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Respuestas</h4>
      <ul className="grid gap-0.5 text-[13px]">
        {op.responses.map((r) => (
          <li key={r.code}>
            <code className={r.code.startsWith("2") ? "font-bold text-primary" : "font-bold text-destructive"}>{r.code}</code>{" "}
            <span className="text-muted-foreground">
              <Inline text={r.description} />
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Renders `inline code` from the OpenAPI descriptions; everything else stays plain text. */
function Inline({ text }: { text: string }) {
  return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}
