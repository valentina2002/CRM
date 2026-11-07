# 03 · WhatsApp Cloud API con coexistencia

**Coexistencia** = el mismo número funciona a la vez en la app WhatsApp Business del celular y en la Cloud API.
Contactos e historial se sincronizan; lo que se responde desde el celular llega al CRM como "eco".

> Verifica siempre contra la documentación oficial de Meta (cambia seguido):
> https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

## Requisitos previos (los hace Valentina)
1. Cuenta de Meta Business (business.facebook.com) — idealmente verificada.
2. App en developers.facebook.com tipo **Business** con el producto **WhatsApp** agregado.
3. Configurar **Embedded Signup** (Facebook Login for Business → configuración con permisos `whatsapp_business_management`,
   `whatsapp_business_messaging`). Para ofrecerlo a terceros hay que ser Tech Provider; para uso propio basta la app propia.
4. El número debe estar ya en la **app WhatsApp Business** (no WhatsApp normal), actualizada.
5. Webhook HTTPS público: `https://TU-DOMINIO/api/webhooks/whatsapp`.

## Implementación del Embedded Signup (modo coexistencia)
- Cargar el SDK de Facebook JS y lanzar `FB.login` con el `config_id` de Embedded Signup.
- En `extras` incluir `featureType: 'whatsapp_business_app_onboarding'` (también en el registro del callback).
- Escuchar `message` del popup: evento `WA_EMBEDDED_SIGNUP` con `event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'` →
  trae `waba_id` (y `phone_number_id`).
- El `code` devuelto por `FB.login` se intercambia en el servidor por un token de negocio
  (`GET /oauth/access_token?client_id&client_secret&code`).
- Con ese token: suscribir la app al WABA (`POST /{waba_id}/subscribed_apps`).
- Guardar `wabaId`, `phoneNumberId`, token cifrado en `WhatsAppAccount`.

## Webhooks a suscribir (campos del WABA)
| Campo | Qué trae | Qué hace el CRM |
|---|---|---|
| `messages` | Mensajes entrantes de clientes y `statuses` de entrega | Crear/actualizar contacto, guardar mensaje `from: them`, emitir `message.received` |
| `smb_message_echoes` | Mensajes que la empresa envía **desde la app del celular** | Guardar mensaje `from: me, via: APP` |
| `history` | Historial de chats previos (se envía por fases tras conectar; hasta ~6 meses) | Importar en lote, sin disparar automatizaciones |
| `smb_app_state_sync` | Contactos de la app y sus cambios | Crear/actualizar contactos |

Si la empresa desactivó compartir historial en la app, `history` llega con un error: mostrarlo en la UI y continuar.

## Endpoint `/api/webhooks/whatsapp`
- `GET`: si `hub.mode === 'subscribe'` y `hub.verify_token === WHATSAPP_VERIFY_TOKEN` → responder `hub.challenge` (texto plano).
- `POST`: leer body crudo → verificar `X-Hub-Signature-256` → guardar payload en `WebhookInbox` → responder **200 de inmediato**
  → procesar async. Recorrer `entry[].changes[]` y despachar por `field`.

## Envío de mensajes
`POST https://graph.facebook.com/{version}/{phone_number_id}/messages`
```json
{ "messaging_product": "whatsapp", "to": "573001234567", "type": "text", "text": { "body": "Hola" } }
```
- Fuera de la ventana de 24 h desde el último mensaje del cliente → solo plantillas aprobadas (`type: "template"`).
- Guardar el `wamid` devuelto; actualizar estado con `statuses` (sent/delivered/read/failed).
- Documentos (PDF de la cuenta de cobro): subir con `POST /{phone_number_id}/media` y enviar `type: "document"`.

## Cosas a tener en cuenta
- Hay funciones de la app que cambian o no se soportan tras conectar (p. ej. ciertos mensajes temporales/grupos): revisar la tabla
  de limitaciones en la doc oficial y avisarle a la usuaria antes de conectar.
- Mensajes de clientes que usan clientes acompañantes no soportados pueden no generar eco.
- Throughput en coexistencia es menor que en un número solo-API.

## Pruebas locales
- Exponer localhost con `ngrok http 3000` o Cloudflare Tunnel y usar esa URL en la configuración del webhook de la app de Meta.
- Fixtures de payloads en `tests/fixtures/whatsapp/*.json` (messages, statuses, smb_message_echoes, history, smb_app_state_sync).
- El prototipo incluye ejemplos de payload en la pantalla "Probar API".
