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
