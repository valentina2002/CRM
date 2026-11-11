# CRM SEO — Instrucciones para Claude Code

## Qué es este proyecto
CRM propio para la agencia/consultoría SEO de Valentina (contratista en Colombia), inspirado en GoHighLevel pero reducido a lo que ella usa:
contactos + pipeline, bandeja de WhatsApp con **coexistencia** (app WhatsApp Business del celular + Cloud API en el mismo número),
cuentas de cobro mensuales, automatizaciones "cuando X → haz Y", API REST propia y webhooks salientes.

El prototipo funcional (HTML único, datos en localStorage) está en `prototipo/crm-seo-prototipo.html`.
**Es la referencia de UX, textos y comportamiento.** Ábrelo antes de construir cada módulo y respeta su flujo.

## Documentos (léelos según la tarea)
- `docs/01-requerimientos.md` — módulos, reglas de negocio, criterios de aceptación
- `docs/02-arquitectura.md` — stack, estructura de carpetas, decisiones
- `docs/03-whatsapp-coexistencia.md` — integración con Meta (Embedded Signup, webhooks `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync`)
- `docs/04-api.md` + `docs/openapi.yaml` — contrato de la API REST y webhooks salientes
- `docs/05-plan-de-fases.md` — orden de trabajo; trabaja **una fase a la vez**
- `prisma/schema.prisma` — modelo de datos inicial (ajústalo si hace falta, explicando por qué)

## Stack
Next.js (App Router) + TypeScript estricto · Tailwind CSS + shadcn/ui · PostgreSQL + Prisma · Auth.js (email + contraseña / Google)
· Zod para validación · Vitest para pruebas · despliegue en Vercel (o Railway) con Postgres en Neon/Supabase.

## Comandos
- `npm run dev` — servidor local en http://localhost:3000
- `npm run lint` / `npm run typecheck` / `npm test` (Vitest) / `npm run build`
- `npm run db:migrate` (= `prisma migrate dev`) · `npm run db:seed` (= `prisma db seed`, **borra y recarga** los datos del prototipo
  y crea/actualiza la usuaria admin con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) · `npm run db:studio`
- `npx prisma generate` — regenera el cliente en `src/generated/prisma` (también corre en `postinstall`)
- BD local temporal (mientras no esté Neon): `npx prisma dev start crm-seo` la levanta (puerto TCP 51214, ya en `.env.local`);
  `npx prisma dev stop crm-seo` la apaga. Al pasar a Neon: cambiar `DATABASE_URL`, `npx prisma migrate deploy` y `npm run db:seed`.

## Notas técnicas (Fase 0)
- **Next.js 16.4** con `cacheComponents` y `partialPrefetching`: todo lo que lea la sesión o la BD va dentro de `<Suspense>`;
  la barra lateral se prerenderiza estática. Lee `node_modules/next/dist/docs/` antes de usar APIs de Next (ver AGENTS.md).
  Middleware ahora se llama **proxy** (`src/proxy.ts`).
- **Prisma 7**: generador `prisma-client` → importa desde `@/generated/prisma/client`; la URL de BD está en `prisma.config.ts`
  (lee `.env.local`); conexión con el adapter `@prisma/adapter-pg`. Cliente compartido en `src/lib/db.ts`.
- **Auth.js v5 (beta)** con Credentials + JWT: `src/auth.config.ts` (sin BD, lo usa el proxy) y `src/auth.ts` (provider).
  El proxy es solo un chequeo optimista; cada página/acción que toca datos llama `requireUser()` de `src/lib/session.ts`.
- Constantes de negocio (etapas con etiquetas en español, servicios, estados, disparadores, canales): `src/lib/constants.ts`.
  En BD las etapas se guardan como enum (`PROSPECT`…); la condición de automatizaciones por etapa usa ese valor.
- Formato COP / fechas Bogotá / teléfonos E.164 / variables `{nombre}`: `src/lib/format.ts`. Fechas `@db.Date`
  (emisión/vencimiento) se formatean con `formatDay`, momentos con `formatDate`.
- Colores del prototipo como tokens en `src/app/globals.css` (shadcn/ui, estilo new-york, utilidades con el paquete `cn`).

## Notas técnicas (Fase 1)
- **Capa de dominio** en `src/lib/services/*` (server-only): toda mutación pasa por aquí (UI hoy, API REST en Fase 5).
  Cada cambio registra `ActivityLog` (con `contactId` → historial de la ficha) y, si aplica, `emit(tx, tipo, payload)`
  dentro de la misma transacción (`src/lib/services/core.ts`). Errores para el usuario: `DomainError` (mensaje en español).
- **Server Actions** en `src/app/(app)/crm-actions.ts`: validan con Zod (`src/lib/validation.ts`), envuelven con
  `runAction()` (`src/lib/action-result.ts`: re-verifica sesión, `refresh()` y traduce errores). En el cliente: `useAction()`.
- **Ficha del cliente** = componente servidor `ContactSheet` (`src/components/crm/contact-sheet.tsx`), reutilizable en el
  panel del chat (Fase 4). Pestañas: Etapa · Historial · Tareas · Etiquetas · Notas.
- Pipeline con `@dnd-kit/core` (mouse, touch y teclado) + selector por tarjeta; `useOptimistic` para mover al instante.
- Reglas decididas en Fase 1: no se puede eliminar un contacto con cuentas de cobro; WhatsApp duplicado → error con el
  nombre del contacto existente; "Cobrado en el mes" usa `paidAt` en el mes actual de Bogotá.
- Para pasar funciones de un Server Component a un Client Component usa `action.bind(null, id)`, no flechas.

## Notas técnicas (Fase 2 · Cuentas de cobro)
- Servicio: `src/lib/services/invoices.ts` (numeración `CC-###` = máximo + 1 con reintento, crear/editar/duplicar,
  enviar, marcar pagada → `invoice.paid`, `checkOverdueInvoices()` → `invoice.overdue`, idempotente).
- Reglas: solo se eliminan borradores; una cuenta pagada no se edita (se duplica); una vencida cuya fecha límite se mueve
  a hoy o después vuelve a Pendiente; fecha de pago no futura. `paidAt` es `@db.Date` (día calendario).
- "Enviar por WhatsApp" hoy guarda el mensaje en la conversación con estado `QUEUED` y marca la cuenta como Pendiente;
  el envío real por Cloud API (texto + PDF como documento) se conecta en la Fase 4.
- Documento: `InvoiceDocument` (pantalla) y `src/lib/invoice-pdf.tsx` (`@react-pdf/renderer`, en
  `serverExternalPackages`). PDF en `/cuentas-de-cobro/[id]/pdf` (`?descargar` para adjunto). Total en letras:
  `src/lib/number-words.ts` (opcional desde "Datos del emisor").
- Job diario: `GET /api/cron/check-overdue` con `Authorization: Bearer $CRON_SECRET`; programado en `vercel.json`
  (11:00 UTC = 6:00 Bogotá). También hay botón "Revisar vencimientos".
- BD local `prisma dev` (PGlite): necesita `DATABASE_POOL_MAX="1"` y `SHADOW_DATABASE_URL` en `.env.local` (ya puestos).
  Dentro de `db.$transaction` usa siempre `tx`, nunca `db` (con pool de 1 conexión se bloquearía).

## Notas técnicas (Fase 3 · Automatizaciones)
- Motor puro en `src/lib/automation-engine.ts` (esquemas Zod de acciones, `matches()`, `runAutomationsForEvent()` sobre
  `EnginePorts`). Pruebas en `automation-engine.test.ts` con un CRM falso en memoria (disparadores, acciones, sin bucles).
- Procesador `src/lib/services/event-processor.ts`: toma eventos `pending` (los reclama → `processing`), corre las
  automatizaciones en una transacción por evento, guarda `AutomationRun` (detalle por acción), suma `runCount`, registra
  actividad y marca `processed` (o `failed`). Los puertos NO pueden emitir eventos → sin cadenas infinitas.
- Se ejecuta al instante tras cada mutación (`runAction` llama `processPendingEvents()` y devuelve `automations` →
  toast "⚡ N automatizaciones ejecutadas"). Respaldo: `GET /api/cron/process-events` (Bearer CRON_SECRET), aún sin
  programar en `vercel.json` (Hobby solo permite cron diario; decidir en Fase 6).
- Condición: "Llega un mensaje" = contiene la palabra (sin mayúsculas ni tildes); "Cambio de etapa" = valor del enum.
  Hasta 5 acciones por automatización. "Enviar WhatsApp" de una automatización queda `QUEUED` (`via: AUTOMATION`)
  hasta la Fase 4. "Mover a etapa" mueve las oportunidades del contacto que no estén en Perdido.

## Notas técnicas (Fase 4 · WhatsApp)
- Flujo: `/api/webhooks/whatsapp` (GET verificación; POST firma `X-Hub-Signature-256` sobre el body crudo → `WebhookInbox` →
  200 → `after(runBackgroundWork)`). `runBackgroundWork()` (`src/lib/services/pipeline.ts`) = inbox → eventos/automatizaciones →
  outbox. También corre en `/api/cron/process-events`.
- Parser puro `src/lib/whatsapp/webhook-parser.ts` (fixtures en `tests/fixtures/whatsapp/`). Aplicación idempotente por
  `(channel, externalId=wamid)` en `src/lib/services/whatsapp-inbox.ts`: entrantes (emite `message.received`, crea contacto y emite
  `contact.created`), estados (nunca retroceden), ecos del celular (`via: APP`, ediciones/borrados), historial (`via: HISTORY`,
  sin eventos ni ventana), contactos de la app (`source: app_sync`, sin eventos; nunca se borran).
- Envío: todo mensaje saliente se crea `QUEUED` y lo manda `processOutbox()` (`whatsapp-outbox.ts`): texto/documento solo con la
  ventana de 24 h abierta (`Conversation.lastInboundAt`), plantillas siempre. Cuenta de cobro = texto + PDF (documento). Sin cuenta
  conectada los mensajes quedan en cola. Emite `message.sent` (solo para webhooks salientes).
- Token de WhatsApp cifrado AES-256-GCM (`src/lib/crypto.ts`, `ENCRYPTION_KEY`). Cliente Graph: `src/lib/whatsapp/graph.ts`.
- Bandeja `/conversaciones?c=<contactId>` (refresco cada 5 s, ficha como 3.ª columna o `&ficha=1` en móvil). Simulador de
  webhooks solo en desarrollo (`simulatorEnabled()`), pasa por el mismo parser/inbox.
- Ajustes `/ajustes`: Embedded Signup (coexistencia) si hay `META_APP_ID` + `META_EMBEDDED_SIGNUP_CONFIG_ID`; si no, conexión manual.
- Detalles verificados de Meta: ver "Verificado contra la doc de Meta" en docs/03.

## Notas técnicas (Fase 5 · API pública y webhooks salientes)
- Rutas en `src/app/api/v1/**/route.ts`, todas envueltas en `apiRoute()` (`src/lib/api/handler.ts`): API key Bearer →
  límite por minuto → handler → errores `{ error }` (`ApiError` con status; `DomainError` → 404/409/422). Tras una escritura
  exitosa corre `runBackgroundWork()` con `after()` (automatizaciones, WhatsApp y webhooks salientes). Fuera del proxy de sesión.
- Validación con Zod en español (`src/lib/api/schemas.ts`, reutiliza `src/lib/validation.ts`); 422 trae `details` por campo.
  `stage` acepta el enum o la etiqueta ("Negociación"). PATCH de contacto solo cambia los campos enviados.
  Respuestas con `src/lib/api/serialize.ts` (fechas ISO; `@db.Date` como `YYYY-MM-DD`).
- API keys `crm_` + 32 caracteres; en BD solo el hash SHA-256 (`src/lib/api/keys.ts`, `src/lib/services/api-keys.ts`). El
  límite (`API_RATE_LIMIT_PER_MINUTE`, 120 por defecto) se cuenta en la fila de la key con un solo `UPDATE … RETURNING`
  (ventana fija de un minuto; serverless no comparte memoria). Headers `X-RateLimit-*` y `Retry-After`.
- `POST /messages` espera la respuesta de Meta (procesa la cola en la misma petición): 201 enviado, 409 sin WhatsApp o
  fuera de la ventana de 24 h, 502 si Meta lo rechaza. Solo a contactos existentes (por `contactId` o `to`).
- Webhooks salientes (`src/lib/webhooks/outgoing.ts` puro + `src/lib/services/webhooks-out.ts`): el procesador de eventos
  crea una `WebhookDelivery` por endpoint suscrito (única por endpoint+evento) en la misma transacción;
  `processWebhookDeliveries()` las envía (reclamándolas antes) con `X-CRM-Event`, `X-CRM-Delivery` y
  `X-CRM-Signature: sha256=HMAC(body, secreto)`. Reintentos 1 min, 5 min, 30 min, 2 h, 12 h; timeout 10 s; sin seguir redirecciones.
  El body lleva `contact` además del payload del evento. Secreto `whsec_…` cifrado con `ENCRYPTION_KEY`, se muestra una vez.
  URLs: solo HTTPS públicas en producción (en desarrollo también http/localhost).
- Los reintentos solo avanzan cuando corre `runBackgroundWork()` (tras acciones de la UI, llamadas a la API, webhooks de Meta o
  `/api/cron/process-events`). Programar ese cron es decisión de la Fase 6.
- `/docs/api` se genera desde `docs/openapi.yaml` (`src/lib/api/openapi-doc.ts`, `"use cache"`). `tests/api-contract.test.ts`
  falla si una ruta de `src/app/api/v1` no está documentada o al revés: al agregar una ruta, actualiza el YAML.
- Ajustes → "API REST del CRM" (crear/revocar keys) y "Webhooks salientes" (crear, pausar, probar con `ping`, eliminar,
  últimas entregas). La página tiene un probador de la API como el del prototipo.

## Notas técnicas (Fase 6 · Despliegue)
- **Producción:** https://crm-seo-ten.vercel.app (Vercel, proyecto `crm-seo` del equipo `valentina-f1c3`, plan Hobby, rama `main`,
  funciones en `iad1`). Build Command: `npx prisma migrate deploy && npx next build` → las migraciones se aplican en cada
  despliegue de producción con `DATABASE_URL`. **Nunca** correr `npm run db:seed` contra producción (borra todo).
- **Base de datos:** Supabase, proyecto `crm-seo` (ref `plizaarrpkozftyyczii`, us-east-1, plan Free, Postgres 17).
  La app y las migraciones usan un rol propio `prisma` (recomendación de Supabase: `bypassrls`, `createdb`, permisos sobre `public`),
  no el usuario `postgres`. Conexión por el **session pooler** (IPv4): `aws-1-us-east-1.pooler.supabase.com:5432`, usuario
  `prisma.plizaarrpkozftyyczii`, con `?uselibpqcompat=true&sslmode=require` (sin eso `pg` trata `require` como `verify-full` y falla
  con "self-signed certificate in certificate chain"). La contraseña del rol solo vive en la variable de Vercel.
- **Seguridad Supabase:** las tablas de Prisma (dueño `prisma`) no tienen permisos para `anon`/`authenticated`; además todas tienen
  **RLS activado sin políticas** y hay un event trigger `rls_auto_enable` que activa RLS en cada tabla nueva de `public`. Los advisors
  de seguridad solo muestran el aviso informativo "RLS enabled, no policy" (esperado). La app no usa la Data API.
- **Variables de entorno (Production):** `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `WHATSAPP_VERIFY_TOKEN`
  (sensitive) · `DATABASE_POOL_MAX=3`, `META_GRAPH_VERSION=v27.0`, `APP_URL`. Sin `AUTH_URL` (trustHost). `META_APP_ID`,
  `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID` aún sin definir. Se cargan con la CLI (`vercel env add … --sensitive`), nunca en el repo.
  Cambiar `ENCRYPTION_KEY` deja ilegibles los tokens y secretos cifrados guardados.
- **Usuaria:** una sola fila en `User` (rol ADMIN, bcrypt costo 12), sin datos de ejemplo.
- **Crons:** `vercel.json` solo programa `/api/cron/check-overdue` (diario 11:00 UTC). `/api/cron/process-events` no está programado:
  en Hobby los cron jobs solo pueden ser diarios; para reintentos de WhatsApp/webhooks cada pocos minutos hace falta Pro o un cron externo
  que llame la ruta con `Authorization: Bearer $CRON_SECRET`.
- **Webhook de WhatsApp (Meta):** `https://crm-seo-ten.vercel.app/api/webhooks/whatsapp` con el `WHATSAPP_VERIFY_TOKEN` de Vercel.
- **Pendiente:** conectar WhatsApp (Meta), dominio propio, programar `process-events`, y pasar a **Vercel Pro** antes de usarlo con
  clientes (Hobby es solo para uso personal no comercial).

## Reglas
- Idioma: **interfaz, textos y mensajes en español (Colombia)**. Código, nombres de variables y commits en inglés.
- Moneda COP (`Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`), zona horaria `America/Bogota`, fechas `dd mmm yyyy`.
- "Cuenta de cobro" (no "factura"): la usuaria es persona natural contratista. El documento dice "DEBE A:" + nombre + C.C.
- Toda entrada externa (API, webhooks, formularios) se valida con Zod. Nunca confíes en el payload de Meta sin verificar la firma `X-Hub-Signature-256`.
- Secretos solo en variables de entorno (`.env.local`, nunca en el repo). El token de WhatsApp se guarda cifrado en BD.
- Webhooks entrantes: responder 200 rápido y procesar después (cola/tabla de eventos), idempotentes por `wamid`.
- Las automatizaciones no deben dispararse en cadena infinita: una acción de automatización no vuelve a emitir eventos (igual que el prototipo).
- Antes de dar una fase por terminada: `lint`, `typecheck` y pruebas en verde, y probar el flujo en el navegador.
- Si una decisión de producto no está en los docs, pregunta a Valentina en lugar de inventar.
