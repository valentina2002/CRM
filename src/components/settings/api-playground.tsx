"use client";

import { Copy, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/crm/contact-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Preset = { method: string; path: string; body?: unknown; label: string };

const PRESETS: Preset[] = [
  { method: "GET", path: "/contacts", label: "Listar contactos" },
  { method: "GET", path: "/contacts?q=seo&page=1", label: "Buscar contactos" },
  {
    method: "POST",
    path: "/contacts",
    body: { name: "Mariana López", company: "Spa Bienestar", phone: "+57 300 555 0199", email: "mariana@ejemplo.co", service: "SEO local", tags: ["lead", "web"] },
    label: "Crear contacto (dispara la bienvenida)",
  },
  { method: "PATCH", path: "/contacts/ID_DEL_CONTACTO", body: { tags: ["cliente", "vip"] }, label: "Actualizar etiquetas" },
  { method: "GET", path: "/deals", label: "Listar oportunidades" },
  { method: "PATCH", path: "/deals/ID_DE_LA_OPORTUNIDAD", body: { stage: "Negociación" }, label: "Cambiar etapa" },
  { method: "POST", path: "/messages", body: { contactId: "ID_DEL_CONTACTO", text: "Hola, te escribo desde la API del CRM." }, label: "Enviar WhatsApp" },
  { method: "GET", path: "/conversations/ID_DEL_CONTACTO/messages", label: "Historial de mensajes" },
  { method: "GET", path: "/invoices?status=SENT", label: "Cuentas de cobro pendientes" },
  { method: "POST", path: "/invoices/ID_DE_LA_CUENTA/pay", label: "Registrar pago" },
];

const METHODS = ["GET", "POST", "PATCH", "DELETE"];

/**
 * Sends real requests to this CRM's /api/v1 from the browser (changes are real and run automations).
 * The API key stays in this component's memory only.
 */
export function ApiPlayground({ baseUrl }: { baseUrl: string }) {
  const [key, setKey] = useState("");
  const [method, setMethod] = useState(PRESETS[0].method);
  const [path, setPath] = useState(PRESETS[0].path);
  const [body, setBody] = useState("");
  const [result, setResult] = useState<string>("Pulsa “Ejecutar” para ver la respuesta.");
  const [busy, setBusy] = useState(false);

  function choose(index: number) {
    const p = PRESETS[index];
    setMethod(p.method);
    setPath(p.path);
    setBody(p.body ? JSON.stringify(p.body, null, 2) : "");
  }

  async function execute() {
    const cleanPath = path.trim().replace(/^\/?(api\/v1)?/, "/");
    let payload: string | undefined;
    if (method !== "GET" && body.trim()) {
      try {
        payload = JSON.stringify(JSON.parse(body));
      } catch (e) {
        setResult(`Error: el body no es un JSON válido.\n${e instanceof Error ? e.message : ""}`);
        return;
      }
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/v1${cleanPath}`, {
        method,
        headers: { Authorization: `Bearer ${key.trim()}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
        body: payload,
        cache: "no-store",
      });
      const type = response.headers.get("content-type") ?? "";
      const text = type.includes("application/json")
        ? JSON.stringify(await response.json(), null, 2)
        : type.includes("pdf")
          ? `(PDF de ${(await response.arrayBuffer()).byteLength} bytes)`
          : await response.text();
      setResult(`HTTP ${response.status}\n\n${text || "(sin contenido)"}`);
    } catch {
      setResult("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  function curl() {
    const cleanPath = path.trim().replace(/^\/?(api\/v1)?/, "/");
    const oneLine = body.trim() ? body.replace(/\s*\n\s*/g, " ") : "";
    const command =
      `curl -X ${method} "${baseUrl}${cleanPath}" \\\n  -H "Authorization: Bearer ${key.trim() || "<API_KEY>"}"` +
      (oneLine && method !== "GET" ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${oneLine.replace(/'/g, "'\\''")}'` : "");
    navigator.clipboard.writeText(command).then(
      () => toast.success("cURL copiado"),
      () => toast.error("No se pudo copiar"),
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <form
        className="grid min-w-0 grid-cols-1 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          execute();
        }}
      >
        <Field label="API key" htmlFor="pg_key">
          <Input id="pg_key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="crm_… (créala en Ajustes → WhatsApp y API)" />
        </Field>
        <Field label="Ejemplo" htmlFor="pg_preset">
          <NativeSelect id="pg_preset" defaultValue="0" onChange={(e) => choose(Number(e.target.value))}>
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.method} {p.path.split("?")[0]} — {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex gap-2">
          <NativeSelect aria-label="Método" className="w-[110px]" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </NativeSelect>
          <Input aria-label="Ruta" value={path} onChange={(e) => setPath(e.target.value)} className="font-mono text-[12.5px]" />
        </div>
        <Field label="Body (JSON)" htmlFor="pg_body">
          <Textarea id="pg_body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[12.5px]" disabled={method === "GET"} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !key.trim()}>
            <Play /> {busy ? "Ejecutando…" : "Ejecutar"}
          </Button>
          <Button type="button" variant="outline" onClick={curl}>
            <Copy /> Copiar como cURL
          </Button>
        </div>
        <p className="text-[12.5px] text-muted-foreground">Las peticiones son reales: crean y cambian datos del CRM y disparan automatizaciones.</p>
      </form>
      <div className="min-w-0">
        <span className="mb-1.5 block text-[13px] font-semibold">Respuesta</span>
        <pre className="max-h-[480px] overflow-auto rounded-md bg-[#0f1b2d] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-[#d7e3f4]" aria-live="polite">
          {result}
        </pre>
      </div>
    </div>
  );
}
