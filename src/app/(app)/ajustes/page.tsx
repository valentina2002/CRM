import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Card } from "@/components/crm/chip";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { CopyField, DisconnectButton, EmbeddedSignupButton, ManualConnectForm, SyncButton } from "@/components/settings/whatsapp-connect";
import { formatDateTime } from "@/lib/format";
import { getWhatsAppAccount } from "@/lib/services/whatsapp-account";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "WhatsApp y API" };

export default function AjustesPage() {
  return (
    <>
      <PageHeader title="WhatsApp y API" subtitle="Conecta tu número con coexistencia y expón tu propia API para integrar otras herramientas." />
      <Suspense fallback={<PageSkeleton title="" />}>
        <Settings />
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
        <Card title="API REST del CRM">
          <p className="text-[13px] text-muted-foreground">Las API keys, la documentación y los webhooks salientes se configuran en la Fase 5.</p>
        </Card>
      </div>
    </div>
  );
}
