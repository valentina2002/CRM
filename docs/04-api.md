# 04 · API REST y webhooks salientes

Contrato completo en `openapi.yaml` (la página `/docs/api` se genera de ahí). Base: `https://TU-DOMINIO/api/v1`.
Auth: `Authorization: Bearer <API_KEY>` (las keys se crean en Ajustes y empiezan por `crm_`). Respuestas JSON `{ data }` o
`{ error }`; los 422 traen `details` por campo. Errores: 400, 401, 404, 409, 422, 429 (y 502 si Meta rechaza un mensaje).
Límite: 120 peticiones por minuto por key (`API_RATE_LIMIT_PER_MINUTE`), headers `X-RateLimit-*` y `Retry-After`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | /contacts?q=&tag=&page= | Listar / buscar contactos |
| POST | /contacts | Crear (dispara `contact.created`) |
| GET | /contacts/{id} | Detalle |
| PATCH | /contacts/{id} | Actualizar campos / etiquetas |
| DELETE | /contacts/{id} | Eliminar |
| GET | /deals?stage= | Listar oportunidades |
| POST | /deals | Crear |
| PATCH | /deals/{id} | Cambiar etapa / valor (dispara `deal.stage_changed`) |
| POST | /messages | Enviar WhatsApp `{ contactId \| to, text }` (solo dentro de la ventana de 24 h) |
| GET | /conversations/{contactId}/messages | Historial |
| GET | /invoices?status= | Listar cuentas de cobro |
| POST | /invoices | Crear borrador `{ contactId, issueDate?, dueDate?, items[] }` (hoy y +15 días por defecto) |
| POST | /invoices/{id}/send | Enviar por WhatsApp |
| POST | /invoices/{id}/pay | Marcar pagada `{ paidAt? }` (dispara `invoice.paid`) |
| GET | /invoices/{id}/pdf | PDF |

## Webhooks salientes
Eventos: `contact.created`, `message.received`, `message.sent`, `deal.stage_changed`, `invoice.paid`, `invoice.overdue`.

```http
POST https://destino.com/hook
X-CRM-Event: invoice.paid
X-CRM-Delivery: <id de la entrega, igual en cada reintento>
X-CRM-Signature: sha256=<hmac del body con el secreto del endpoint>
Content-Type: application/json

{ "id": "evt_...", "type": "invoice.paid", "createdAt": "2026-11-06T20:00:00-05:00", "data": { ..., "contact": { ... } } }
```
Reintentos si no responde 2xx en 10 s: 1 min, 5 min, 30 min, 2 h, 12 h. Una entrega puede llegar más de una vez: usa `id`.
El secreto (`whsec_…`) se muestra una sola vez al crear el webhook. Botón "Probar" envía un evento `ping`.
Log de entregas en Ajustes → Webhooks salientes.
