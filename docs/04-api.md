# 04 · API REST y webhooks salientes

Contrato completo en `openapi.yaml`. Base: `https://TU-DOMINIO/api/v1`.
Auth: `Authorization: Bearer <API_KEY>`. Respuestas JSON `{ data }` o `{ error }`. Errores: 400, 401, 404, 409, 422, 429.

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
| POST | /messages | Enviar WhatsApp `{ contactId \| to, text }` |
| GET | /conversations/{contactId}/messages | Historial |
| GET | /invoices?status= | Listar cuentas de cobro |
| POST | /invoices | Crear `{ contactId, date, due, items[] }` |
| POST | /invoices/{id}/send | Enviar por WhatsApp |
| POST | /invoices/{id}/pay | Marcar pagada (dispara `invoice.paid`) |
| GET | /invoices/{id}/pdf | PDF |

## Webhooks salientes
Eventos: `contact.created`, `message.received`, `message.sent`, `deal.stage_changed`, `invoice.paid`, `invoice.overdue`.

```http
POST https://destino.com/hook
X-CRM-Event: invoice.paid
X-CRM-Signature: sha256=<hmac del body con el secreto del endpoint>
Content-Type: application/json

{ "id": "evt_...", "type": "invoice.paid", "createdAt": "2026-11-06T20:00:00-05:00", "data": { ... } }
```
Reintentos: 1 min, 5 min, 30 min, 2 h, 12 h. Log de entregas visible en Ajustes → Webhooks.
