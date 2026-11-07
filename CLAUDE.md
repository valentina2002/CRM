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
