# 02 · Arquitectura

## Stack y por qué
| Capa | Elección | Motivo |
|---|---|---|
| App | Next.js (App Router) + TypeScript | UI + API en un solo proyecto, fácil de desplegar |
| UI | Tailwind + shadcn/ui | Componentes accesibles, look similar al prototipo |
| BD | PostgreSQL + Prisma | Relacional, migraciones, tipado |
| Auth | Auth.js | Sesión para la UI; API keys propias para la API |
| Validación | Zod | Mismo esquema para formularios, API y webhooks |
| Jobs | Tabla `Event` + cron (Vercel Cron) cada minuto | Simple; migrar a Inngest/QStash si crece |
| PDF | `@react-pdf/renderer` | Cuentas de cobro en PDF |
| Hosting | Vercel + Neon/Supabase | Gratis/barato al inicio, HTTPS (Meta exige HTTPS en el webhook) |

## Estructura propuesta
```
src/
  app/
    (app)/tablero | contactos | pipeline | conversaciones | cuentas-de-cobro | automatizaciones | ajustes/(whatsapp|api|webhooks)
    api/v1/contacts | deals | messages | invoices ...      ← API REST pública (API key)
    api/webhooks/whatsapp/route.ts                         ← GET verificación + POST eventos de Meta
    api/cron/process-events | check-overdue                 ← jobs
  lib/
    db.ts            prisma client
    events.ts        emit() → guarda Event; processor ejecuta automatizaciones y webhooks salientes
    automations.ts   motor (igual lógica que el prototipo)
    whatsapp/        client.ts (Graph API), webhook-parser.ts, signature.ts, embedded-signup.ts
    invoices.ts      numeración, totales, PDF
    api-auth.ts      validación de API key (hash SHA-256 en BD)
    format.ts        COP, fechas es-CO
  components/        UI compartida
prisma/schema.prisma, seed.ts
docs/ prototipo/
```

## Flujo de eventos
1. Algo ocurre (UI, API o webhook de Meta) → servicio de dominio guarda cambio + `emit(type, payload)` (fila en `Event`).
2. Procesador (inmediato tras la request con `after()` de Next, y cron de respaldo) toma eventos `pending`:
   - corre automatizaciones que coinciden (acciones sin re-emitir),
   - encola entregas a webhooks salientes suscritos,
   - marca `processed`.
3. Idempotencia: mensajes por `wamid` único; eventos por id.

## Seguridad
- Firma de Meta: HMAC-SHA256 del body crudo con `META_APP_SECRET`, comparar con `X-Hub-Signature-256` (timing-safe).
- API keys: mostrar solo una vez, guardar hash. Rate limit básico por key.
- Token de WhatsApp cifrado (AES-256-GCM con `ENCRYPTION_KEY`).
- Webhooks salientes firmados con secreto por endpoint.

## Variables de entorno
Ver `.env.example`.
