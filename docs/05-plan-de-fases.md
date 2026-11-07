# 05 · Plan de fases

Trabaja una fase por sesión. Al terminar cada una: lint + typecheck + pruebas en verde, probar en el navegador, commit.
Debajo de cada fase está el mensaje que Valentina puede pegarle a Claude Code.

---

## Fase 0 · Base del proyecto
Next.js + TS + Tailwind + shadcn/ui, Prisma con `prisma/schema.prisma`, seed con los datos del prototipo, Auth.js (login),
layout con barra lateral igual al prototipo, utilidades de formato COP/fechas, Vitest.

> Lee CLAUDE.md y los docs. Haz la Fase 0 del plan: crea el proyecto Next.js en esta carpeta (sin borrar docs/, prisma/ ni prototipo/),
> configura Prisma con el schema existente, el seed con los datos del prototipo, el login y el layout con la barra lateral del prototipo.
> Antes de empezar muéstrame tu plan.

## Fase 1 · Contactos + Pipeline + Tablero
CRUD de contactos con búsqueda y etiquetas, ficha del cliente `/contactos/[id]` (etapa, historial, tareas, etiquetas, notas), Kanban con drag & drop (dnd-kit) y selector móvil, tablero con KPIs, tareas y actividad.
Servicio `emit()` guardando eventos (aún sin procesador).

> Haz la Fase 1. Copia la UX del prototipo (pantallas Contactos, Pipeline y Tablero).

## Fase 2 · Cuentas de cobro
Numeración CC-###, líneas, estados, datos del emisor, vista del documento, PDF, duplicar del mes anterior, job de vencimientos.

> Haz la Fase 2 (cuentas de cobro) siguiendo el prototipo y los requerimientos. Incluye PDF y "duplicar cuenta del mes anterior".

## Fase 3 · Motor de automatizaciones
Procesador de eventos, CRUD de automatizaciones con el constructor del prototipo, historial de ejecuciones, pruebas unitarias del motor.
(La acción "Enviar WhatsApp" queda simulada guardando el mensaje hasta la Fase 4.)

> Haz la Fase 3: procesador de eventos y automatizaciones. Escribe pruebas para cada disparador y acción y para evitar bucles.

## Fase 4 · WhatsApp Cloud API + coexistencia
Endpoint de webhook (verificación, firma, inbox, despacho por campo), bandeja de conversaciones, envío por Graph API,
estados de entrega, Embedded Signup con `featureType: whatsapp_business_app_onboarding`, importación de `history` y
`smb_app_state_sync`, ecos `smb_message_echoes`, ventana de 24 h y plantillas.

> Haz la Fase 4 siguiendo docs/03-whatsapp-coexistencia.md. Empieza por el webhook con fixtures y pruebas; después la bandeja;
> al final el Embedded Signup. Dime qué datos de Meta necesitas que yo configure.

## Fase 4b · Facebook, Instagram y TikTok
Conexión de página de Facebook e Instagram profesional (misma app de Meta), webhooks de Messenger e Instagram, envío, hilo unificado
por cliente con ícono de canal y selector de canal al responder, fusión de contactos. TikTok solo si su API de mensajería está disponible
para la cuenta (verificar antes).

> Haz la Fase 4b: agrega Facebook Messenger e Instagram al hilo unificado. Verifica primero si TikTok es viable y dime qué necesitas de mí.

## Fase 5 · API pública + webhooks salientes
API keys (hash), rutas según `docs/openapi.yaml`, rate limit, página `/docs/api`, webhooks salientes firmados con reintentos.

> Haz la Fase 5: API REST según openapi.yaml y webhooks salientes con firma y reintentos.

## Fase 6 · Despliegue
Postgres en Neon/Supabase, Vercel, variables de entorno, cron jobs, dominio, URL del webhook en Meta, checklist de seguridad.

> Prepara el despliegue (Fase 6): guíame paso a paso para Vercel + Neon y configura los cron jobs.
