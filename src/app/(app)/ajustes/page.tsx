import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Card, Chip } from "@/components/crm/chip";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { CopyButton, CreateApiKeyDialog, CreateWebhookDialog, RevokeApiKeyButton, WebhookControls } from "@/components/settings/api-settings";
import { MethodBadge } from "@/components/settings/method-badge";
import { CopyField, DisconnectButton, EmbeddedSignupButton, ManualConnectForm, SyncButton } from "@/components/settings/whatsapp-connect";
import { Input } from "@/components/ui/input";
import { rateLimitPerMinute } from "@/lib/api/rate-limit";
import { formatDate, formatDateTime } from "@/lib/format";
import { listApiKeys } from "@/lib/services/api-keys";
import { listRecentDeliveries, listWebhookEndpoints } from "@/lib/services/webhooks-out";
import { getWhatsAppAccount } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { deliveryStatus } from "@/lib/webhooks/outgoing";

export const metadata: Metadata = { title: "WhatsApp y API" };

export default function AjustesPage() {
  return (
    <>
      <PageHeader title="WhatsApp y API" subtitle="Conecta tu número con coexistencia y expón tu propia API para integrar otras herramientas." />
      <Suspense fallback={<PageSkeleton title="" />}>
        <Settings />
        <ApiAndWebhooks />
      </Suspense>
    </>
  );
}

function Step({ done, warn, title, children }: { done: boolean; warn?: boolean; title: string; children: ReactNode }) {
  return (
    <li className="relative border-b py-[9px] pl-9 last:border-b-0">
      <span
        className={cn(
          "absolute top-2 left-0 grid size-6 place-items-center rounded-full text-[12px] font-bold",
          done ? "bg-primary text-white" : warn ? "bg-warning-soft text-warning" : "bg-secondary text-muted-foreground",
        )}
        aria-hidden
      >
        {done ? "✓" : warn ? "!" : "·"}
      </span>
      <strong>{title}</strong>
      <div className="text-[13px] text-muted-foreground">{children}</div>
    </li>
  );
}

async function Settings() {
  await requireUser();
  const account = await getWhatsAppAccount();
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const appId = process.env.META_APP_ID ?? "";
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? "";
  const hasSecret = Boolean(process.env.META_APP_SECRET);
  const graphVersion = process.env.META_GRAPH_VERSION || "v27.0";
  const sync = account?.sync ?? {};
  const syncDeadline = sync.requestedAt ? new Date(new Date(account!.connectedAt).getTime() + 24 * 3600 * 1000) : null;
  const isPublicHttps = appUrl.startsWith("https://");

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card title="WhatsApp Cloud API · Coexistencia">
        <p className="-mt-1.5 mb-3 text-[12.5px] text-muted-foreground">
          Con coexistencia sigues usando la app WhatsApp Business en tu celular con el mismo número, y el CRM envía y recibe por la API. Lo que respondas desde el
          celular aparece aquí.
        </p>

        <ol className="mb-4">
          <Step done={Boolean(account)} title="Conectar con Meta">
            {account ? (
              <>
                Conectado {account.displayPhone ? <strong className="text-foreground">{account.displayPhone}</strong> : null} el {formatDateTime(account.connectedAt)} · WABA{" "}
                {account.wabaId} · número {account.phoneNumberId}
              </>
            ) : (
              "Registro integrado de Meta con la opción de usar tu número existente de WhatsApp Business."
            )}
          </Step>
          <Step done={Boolean(account?.coexistence)} title="Confirmar desde el celular">
            La app WhatsApp Business muestra un aviso / código QR para autorizar la conexión. {account && !account.coexistence ? "Este número está conectado solo por API." : null}
          </Step>
          <Step
            done={Boolean(account?.historySynced) || Boolean(sync.historyError)}
            warn={Boolean(sync.contactsError || sync.historyRequestError || sync.historyError)}
            title="Sincronizar contactos e historial"
          >
            {!account?.coexistence ? (
              "Se pide automáticamente al conectar en modo coexistencia (Meta solo lo permite una vez y durante las primeras 24 h)."
            ) : (
              <div className="grid gap-1">
                <span>
                  Contactos: {sync.contactsRequestId ? "solicitados" : sync.contactsError ? <span className="text-destructive">{sync.contactsError}</span> : "pendiente"}
                  {sync.contactsImported ? ` · ${sync.contactsImported} importados` : ""}
                </span>
                <span>
                  Historial:{" "}
                  {sync.historyError ? (
                    <span className="text-warning">{sync.historyError}</span>
                  ) : sync.historyProgress != null ? (
                    `${sync.historyProgress}% importado`
                  ) : sync.historyRequestId ? (
                    "solicitado, esperando a Meta"
                  ) : sync.historyRequestError ? (
                    <span className="text-destructive">{sync.historyRequestError}</span>
                  ) : (
                    "pendiente"
                  )}
                </span>
                {(sync.contactsError || sync.historyRequestError) && syncDeadline && syncDeadline > new Date() ? (
                  <span className="mt-1">
                    <SyncButton /> <span className="ml-1">Puedes reintentar hasta el {formatDateTime(syncDeadline)}.</span>
                  </span>
                ) : null}
              </div>
            )}
          </Step>
          <Step done={Boolean(account) && hasSecret} warn={Boolean(account) && !hasSecret} title="Webhooks suscritos">
            En tu app de Meta (WhatsApp → Configuración) usa la URL y el token de abajo y suscribe los campos <code>messages</code>, <code>smb_message_echoes</code>,{" "}
            <code>smb_app_state_sync</code>, <code>history</code> y <code>account_update</code>.
            {!hasSecret ? <span className="block text-warning">Falta META_APP_SECRET en el servidor: sin él se rechazan todos los webhooks (firma).</span> : null}
          </Step>
        </ol>

        <div className="grid gap-3">
          <CopyField label="URL del webhook (para Meta)" value={webhookUrl} />
          {!isPublicHttps ? (
            <p className="-mt-1 text-[12.5px] text-warning">
              Meta exige una URL pública con HTTPS. En tu PC usa un túnel (ngrok o Cloudflare Tunnel) y pon esa dirección en APP_URL, o espera al despliegue (Fase 6).
            </p>
          ) : null}
          <CopyField label="Verify token del webhook" value={verifyToken} secret />
        </div>

        <div className="mt-5 grid gap-3 border-t pt-4">
          {account ? (
            <DisconnectButton />
          ) : appId && configId ? (
            <div className="grid gap-2">
              <div>
                <EmbeddedSignupButton appId={appId} configId={configId} graphVersion={graphVersion} />
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Abre la ventana de Meta: elige tu portafolio, “Conectar tu app WhatsApp Business existente” y confirma desde el celular.
              </p>
            </div>
          ) : (
            <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
              Para el botón “Conectar con Meta” faltan <code>META_APP_ID</code> y <code>META_EMBEDDED_SIGNUP_CONFIG_ID</code> en el servidor. Mientras tanto puedes conectar
              con los datos manuales de abajo (por ejemplo, el número de prueba de Meta).
            </p>
          )}
          {!account ? (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-[13px] font-semibold">Conectar manualmente (WABA ID, Phone Number ID y token)</summary>
              <div className="mt-3">
                <ManualConnectForm />
              </div>
            </details>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4">
        <Card title="Antes de conectar: lo que cambia en tu celular">
          <ul className="grid list-disc gap-1 pl-5 text-[13px] text-muted-foreground">
            <li>Necesitas la app WhatsApp Business actualizada (2.24.17 o superior) y el número debe estar en ella.</li>
            <li>Se desactivan: mensajes temporales y de una sola vista, ubicación en tiempo real, listas de difusión, llamadas, catálogo/pedidos, mensaje de bienvenida y de ausencia, respuestas rápidas y etiquetas de la app.</li>
            <li>Los grupos no se sincronizan con el CRM.</li>
            <li>Se desvinculan tus dispositivos vinculados; puedes volver a vincular hasta 4 (no WhatsApp para Windows ni WearOS).</li>
            <li>Abre la app en el celular al menos cada 14 días o Meta desconecta el número.</li>
            <li>Lo que envías desde el celular sigue siendo gratis; lo que envía el CRM usa la tarifa de la Cloud API. Envío máximo: 20 mensajes por segundo.</li>
            <li>El historial (hasta 6 meses) y los contactos se importan una sola vez, en las 24 h siguientes a conectar.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

const API_ROUTES: [method: string, path: string, label: string][] = [
  ["GET", "/contacts", "Listar / buscar contactos"],
  ["POST", "/contacts", "Crear contacto"],
  ["PATCH", "/contacts/{id}", "Actualizar contacto"],
  ["GET", "/deals", "Listar oportunidades"],
  ["PATCH", "/deals/{id}", "Cambiar etapa o valor"],
  ["POST", "/messages", "Enviar WhatsApp"],
  ["GET", "/invoices", "Listar cuentas de cobro"],
  ["POST", "/invoices/{id}/pay", "Registrar pago"],
];

const DELIVERY_TONE = {
  ok: "bg-success-soft text-primary",
  pending: "bg-secondary text-muted-foreground",
  retry: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-destructive",
} as const;

async function ApiAndWebhooks() {
  await requireUser();
  const [keys, endpoints, deliveries] = await Promise.all([listApiKeys(), listWebhookEndpoints(), listRecentDeliveries()]);
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      <Card title="API REST del CRM" actions={<CreateApiKeyDialog />}>
        <p className="-mt-1.5 mb-3 text-[12.5px] text-muted-foreground">
          Conecta Zapier, Make, n8n o tu web. Cada petición lleva el header <code>Authorization: Bearer &lt;API key&gt;</code>.
        </p>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold">URL base</span>
          <div className="flex gap-2">
            <Input readOnly value={`${appUrl}/api/v1`} className="font-mono text-[12.5px]" aria-label="URL base de la API" />
            <CopyButton value={`${appUrl}/api/v1`} />
          </div>
        </div>

        <h4 className="mt-4 mb-1 text-[13px] font-semibold">API keys</h4>
        {keys.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aún no hay API keys. Crea una para empezar.</p>
        ) : (
          <ul>
            {keys.map((k) => (
              <li key={k.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0", k.revokedAt && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <strong className="text-[13.5px]">{k.name}</strong> <code className="text-[12px] text-muted-foreground">{k.prefix}…</code>
                  <div className="text-[12px] text-muted-foreground">
                    {k.revokedAt
                      ? `Revocada el ${formatDateTime(k.revokedAt)}`
                      : `Creada el ${formatDate(k.createdAt)} · ${k.lastUsedAt ? `último uso ${formatDateTime(k.lastUsedAt)}` : "sin usar todavía"}`}
                  </div>
                </div>
                {k.revokedAt ? <Chip>Revocada</Chip> : <RevokeApiKeyButton id={k.id} name={k.name} />}
              </li>
            ))}
          </ul>
        )}
        {activeKeys.length > 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">Límite: {rateLimitPerMinute()} peticiones por minuto por key.</p>
        ) : null}

        <table className="mt-4 w-full text-[13px]">
          <tbody>
            {API_ROUTES.map(([method, path, label]) => (
              <tr key={method + path} className="border-b last:border-b-0">
                <td className="py-1.5 pr-2 align-top">
                  <MethodBadge method={method} />
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <code className="break-all">{path}</code>
                </td>
                <td className="py-1.5 align-top text-muted-foreground">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link href="/docs/api" className="mt-3 inline-block text-[13px] font-semibold text-info hover:underline">
          Ver la documentación completa →
        </Link>
      </Card>

      <Card title="Webhooks salientes" actions={<CreateWebhookDialog />}>
        <p className="-mt-1.5 mb-3 text-[12.5px] text-muted-foreground">
          El CRM avisa a otras apps cuando algo pasa. Cada envío va firmado (<code>X-CRM-Signature</code>) y, si falla, se reintenta a los 1 min, 5 min, 30 min, 2 h y 12 h.
        </p>
        {endpoints.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Sin webhooks.</p>
        ) : (
          <ul>
            {endpoints.map((e) => (
              <li key={e.id} className={cn("border-b py-2 last:border-b-0", !e.active && "opacity-70")}>
                <code className="block text-[12.5px] break-all">{e.url}</code>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {e.events.map((ev) => (
                      <Chip key={ev}>{ev}</Chip>
                    ))}
                  </div>
                  <WebhookControls id={e.id} url={e.url} active={e.active} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <h4 className="mt-4 mb-1 text-[13px] font-semibold">Últimas entregas</h4>
        {deliveries.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Todavía no se ha enviado nada.</p>
        ) : (
          <ul className="text-[12.5px]">
            {deliveries.map((d) => {
              const status = deliveryStatus(d);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b py-1.5 last:border-b-0">
                  <code className="font-semibold">{d.eventType}</code>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium", DELIVERY_TONE[status.tone])}>{status.label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={d.endpoint.url}>
                    {hostOf(d.endpoint.url)}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(d.lastAttemptAt ?? d.createdAt)}</span>
                  {d.error && !d.ok ? <span className="w-full text-destructive">{d.error}{d.nextTryAt && d.lastAttemptAt ? ` · próximo intento ${formatDateTime(d.nextTryAt)}` : ""}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
