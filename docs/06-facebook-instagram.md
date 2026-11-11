# 06 · Facebook Messenger e Instagram (Fase 4b)

Un solo hilo por cliente: los mensajes de WhatsApp, de la página de Facebook y de la cuenta profesional de Instagram se ven
juntos, cada uno con la marca de su canal. Al responder se elige el canal; por defecto, el último por el que escribió el cliente.

## Camino elegido: "Instagram API with Facebook Login" (Messenger Platform)
- **Un token de página** (Page access token) envía y recibe para la página **y** para la cuenta de Instagram profesional
  vinculada a ella. Al conectar la página el CRM detecta la cuenta de Instagram (`instagram_business_account`).
- Existe otro camino ("Instagram API with Instagram Login", `graph.instagram.com`, sin página). No se usó para tener una sola
  conexión y un solo tipo de token. Si Valentina no quiere vincular Instagram a una página, ese es el camino alternativo.
- **TikTok: no se construyó.** TikTok tiene una Business Messaging API, pero el acceso exige revisión y aprobación de TikTok y,
  según su propio blog (nov 2026), seguía en beta con disponibilidad global "próximamente". No está disponible para cuentas del
  EEE, Suiza ni Reino Unido. Fuentes: business-api.tiktok.com/portal/docs/access-to-business-messaging-api/v1.3 y
  ads.tiktok.com/business/en/blog/messaging-ads.

## Qué hace Valentina (en Meta)
1. La cuenta de Instagram debe ser **profesional** (empresa o creador) y estar **vinculada a la página** de Facebook.
2. En la misma app de Meta del WhatsApp: agregar los productos **Messenger** e **Instagram** (webhooks).
3. Token de página con permisos de mensajes de la página y de Instagram (`pages_messaging`, `pages_manage_metadata`,
   `instagram_basic`, `instagram_manage_messages`; verificar nombres vigentes en el panel). Un token de **usuario del sistema**
   de Meta Business no expira.
4. Webhooks: URL `https://TU-DOMINIO/api/webhooks/meta`, el mismo verify token (`WHATSAPP_VERIFY_TOKEN`).
   - Messenger (página): `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`, `message_echoes`.
   - Instagram: `messages`, `messaging_seen` (en Instagram los ecos llegan por `messages`).
5. La app debe estar en modo **Live**, y para escribir a personas que no son administradoras/testers de la app, Meta exige
   **App Review** de esos permisos.
6. En el CRM: Ajustes → "Facebook Messenger e Instagram" → ID de la página + token.

## Reglas del CRM
- **Ventana de 24 h por canal**, contada desde el último mensaje del cliente **en ese canal** (no hay plantillas como en
  WhatsApp). La etiqueta `HUMAN_AGENT` (7 días) existe pero requiere aprobación de Meta; no se implementó.
- Texto hasta **1000 caracteres** en Facebook/Instagram (WhatsApp: 4096). Solo texto: las cuentas de cobro siguen saliendo por WhatsApp.
- Meta **no entrega el teléfono**: quien escribe por primera vez llega como contacto nuevo (fuente `facebook`/`instagram`,
  etiqueta del canal, oportunidad en Prospecto, emite `contact.created` → bienvenida). Si ya era cliente, se une con **Fusionar**.
- **Fusionar** (ficha del cliente): canales, mensajes, oportunidades, tareas, notas, historial y cuentas de cobro pasan al contacto
  que se conserva; etiquetas se unen; los campos vacíos se completan; el otro contacto se elimina. La oportunidad automática vacía
  "Nueva oportunidad (…)" se descarta si el destino ya tiene oportunidades.
- Nombre del contacto: se pide el perfil a Meta (`first_name,last_name` en Messenger; `name,username` en Instagram) antes de
  guardar. Si Meta no lo da (permisos), queda "Contacto de Facebook/Instagram".
- **Automatizaciones**: "Enviar WhatsApp" sale por el último canal por el que escribió el cliente si es Facebook/Instagram;
  si no, por WhatsApp. Un contacto sin teléfono pero con Facebook/Instagram sí recibe la respuesta automática.
- Ecos: si `app_id` = `META_APP_ID` es un mensaje del propio CRM (se ignora). Sin `META_APP_ID`, el eco se empareja con el mensaje
  del CRM que se está enviando (mismo texto, últimos 5 min). Los demás ecos son respuestas desde la bandeja de la página o la app de
  Instagram (`via: APP`).
- Estados: `delivery` (mids o watermark) → Entregado; `read` (watermark en Messenger, mid en Instagram) → Leído. Nunca retroceden.
- La API REST (`POST /api/v1/messages`) sigue enviando solo por WhatsApp.

## Verificado y pendiente de verificar
No se pudo abrir developers.facebook.com desde la sesión de desarrollo; se confirmó con búsquedas (nov 2026):
- ✔ Formato de webhooks `entry[].messaging[]` con `sender.id`, `recipient.id`, `timestamp`, `message.mid`, `is_echo`, `app_id`.
- ✔ En Instagram los ecos llegan por el campo `messages`.
- ✔ El camino con Facebook Login sigue activo en 2026; la ventana de 24 h y `HUMAN_AGENT` (7 días, con aprobación).
- ⚠ **Probar con una página real antes de dar por buena la Fase 4b:** envío de Instagram por `POST /{page-id}/messages` con el
  token de página, `POST /{page-id}/subscribed_apps?subscribed_fields=…`, campos de perfil, y nombres exactos de permisos.
  Si el envío a Instagram falla, la alternativa documentada es `POST /{ig-user-id}/messages`.
