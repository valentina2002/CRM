# 01 · Requerimientos

## Usuarios
- **Valentina (admin)**: consultora SEO. Uso diario desde PC y celular.
- Futuro (no MVP): colaboradores con permisos limitados; multi-cuenta para revender.

## Módulos del MVP

### 1. Tablero
KPIs: contactos, clientes activos, valor del pipeline abierto (Prospecto + Propuesta enviada + Negociación), cobrado en el mes,
por cobrar (pendientes + vencidas) con número de vencidas, mensajes sin leer. Barras de valor por etapa. Tareas pendientes
(check para completar). Actividad reciente (últimos eventos del sistema).

### 2. Contactos
- Campos: nombre*, empresa, WhatsApp (E.164), correo, servicio (SEO técnico, SEO local, Contenidos / blog, Auditoría SEO, SEO para IA (GEO)),
  etiquetas, valor mensual (COP), notas.
- Búsqueda por nombre/empresa/teléfono/correo/etiqueta. Crear, editar, eliminar (con confirmación).
- Al crear un contacto: se crea una oportunidad en "Prospecto", se abre su conversación y se emite `contact.created`.
- Deduplicar por teléfono normalizado.

### 2b. Ficha del cliente (agregado 06 nov 2026)
- Toda conversación pertenece a un contacto (cliente). Cada contacto tiene su ficha: datos básicos (campos del módulo 2) y etiquetas editables.
- La ficha se muestra en **dos lugares**: panel a la derecha de la conversación (en móvil se abre con un botón) y página propia `/contactos/[id]`.
- En la ficha, accesos con íconos a:
  - **Etapa del pipeline**: cambiarla desde ahí (emite `deal.stage_changed` igual que el Kanban).
  - **Historial**: cambios de etapa, etiquetas, datos editados, cuentas de cobro, automatizaciones ejecutadas (con fecha y origen).
  - **Tareas** del contacto (crear, completar).
  - **Etiquetas** (agregar / quitar).
  - **Notas**: varias notas con fecha (no un solo campo de texto).

### 3. Pipeline
- Etapas fijas (configurables más adelante): Prospecto · Propuesta enviada · Negociación · Cliente activo · Perdido.
- Kanban con arrastrar y soltar + selector de etapa en la tarjeta (móvil). Totales por columna.
- Cambiar de etapa registra actividad y emite `deal.stage_changed`.

### 4. Conversaciones (WhatsApp)
- Bandeja: lista de chats (último mensaje, hora, no leídos) + panel de chat.
- Cada mensaje saliente muestra su origen: **CRM · Cloud API**, **App WhatsApp Business (celular)** o **Automatización**.
- Enviar texto; respuestas rápidas con variables; indicador de coexistencia activa.
- Entrantes llegan por webhook `messages`; lo respondido desde el celular llega por `smb_message_echoes`; al conectar se importa
  historial (`history`) y contactos (`smb_app_state_sync`).
- Estados de entrega (enviado/entregado/leído) desde `statuses`.
- Regla de 24 h de Meta: fuera de la ventana solo se puede enviar plantilla aprobada → la UI lo indica y ofrece plantillas.

### 4b. Otros canales: Facebook, Instagram y TikTok (agregado 06 nov 2026)
- Además de WhatsApp, el CRM recibe y envía mensajes de **Facebook Messenger**, **Instagram Direct** y **TikTok**.
- **Un solo hilo por cliente**: los mensajes de todos los canales se ven juntos en orden de tiempo, cada uno con el ícono de su canal;
  al responder se elige por qué canal sale (por defecto, el último por el que escribió el cliente).
- Un contacto puede tener una identidad por canal (teléfono de WhatsApp, PSID de Facebook, IGSID de Instagram, id de TikTok);
  si llega un mensaje de una identidad desconocida se crea el contacto y luego se puede **fusionar** con uno existente.
- Facebook e Instagram usan la misma app de Meta (Messenger Platform / Instagram Messaging API; Instagram requiere cuenta profesional
  vinculada a una página de Facebook). Ventana de 24 h similar a WhatsApp.
- TikTok: **verificado (nov 2026), no se construye por ahora.** Su Business Messaging API exige revisión y aprobación de TikTok y
  seguía en beta. Ver docs/06-facebook-instagram.md.
- Se construye en la Fase 4b, después de WhatsApp. El modelo de datos queda preparado desde la Fase 0.

### 5. Cuentas de cobro
- Número consecutivo `CC-001`… Cliente, fecha de emisión, fecha límite de pago, líneas (actividad, cantidad, valor unitario).
- Estados: Borrador → Pendiente (enviada) → Pagada; Pendiente con fecha pasada → Vencida (job diario).
- Datos del emisor: nombre, C.C./NIT, ciudad, datos de pago.
- Ver documento formato colombiano ("CUENTA DE COBRO N.º …", "DEBE A:", total en letras opcional, firma). Exportar PDF.
- Enviar por WhatsApp (texto + PDF adjunto como documento). Marcar pagada (fecha de pago).
- Eventos: `invoice.paid`, `invoice.overdue`.
- Duplicar cuenta del mes anterior (caso de uso principal: cobro mensual recurrente con las actividades realizadas).

### 6. Automatizaciones
- Disparadores: contacto creado · mensaje entrante (condición: contiene palabra clave) · cambio de etapa (condición: etapa) ·
  cuenta pagada · cuenta vencida.
- Acciones (hasta 8 en orden): enviar WhatsApp (texto con variables `{nombre} {empresa} {factura} {valor} {vence}`; sale por el
  último canal del cliente), agregar etiqueta, mover a etapa, crear tarea, **esperar** X tiempo, **esperar hasta la fecha límite**
  de la cuenta de cobro y **detener si…** (respondió / pagada / etapa). Futuro: enviar plantilla, webhook.
- Disparadores agregados en la Fase 7: "Se envía una cuenta de cobro"; "Se crea un contacto" con filtro por origen.
- Activar/pausar, contador de ejecuciones, historial de ejecuciones con resultado.
- Las acciones no re-emiten eventos (evita bucles).

### 7. WhatsApp y API (configuración)
- Conectar WhatsApp con Embedded Signup en modo coexistencia (ver doc 03). Mostrar estado de cada paso.
- API REST con API keys (crear, revocar, ver último uso). Documentación en `/docs/api` generada desde OpenAPI.
- Webhooks salientes: URL + eventos; firma HMAC `X-CRM-Signature`; reintentos con backoff; log de entregas.

### 8. Formularios y reportes (Fase 7)
- Formularios de captura públicos (`/f/{id}` y HTML para la web): nombre, empresa, WhatsApp o correo, mensaje y autorización de
  datos (Ley 1581 de 2012). Crea el contacto con origen "Formulario web" (o nota si ya existe) y dispara automatizaciones.
- Reportes: origen y conversión de contactos, tasa de cierre, cobrado por mes/servicio/cliente, cartera por antigüedad, tiempo de respuesta.
- Respuestas rápidas del chat editables.

## Criterios de aceptación clave
1. Un mensaje enviado desde el celular aparece en el chat del CRM marcado "App WhatsApp Business" en < 10 s.
2. Un cliente que escribe "precio" recibe la respuesta automática y queda con la etiqueta configurada.
3. Marcar una cuenta como pagada mueve al cliente a "Cliente activo" y envía el agradecimiento (si la automatización está activa).
4. `POST /api/v1/contacts` con API key válida crea el contacto y dispara la bienvenida; sin key → 401.
5. Todo funciona en móvil (ancho 390 px).

## Fuera del MVP
Email marketing, embudos/landing pages, reputación, IA conversacional, calendario de citas, pasarelas de pago, multi-cuenta.
