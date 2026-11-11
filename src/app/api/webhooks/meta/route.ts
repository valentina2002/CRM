// Same handler as /api/webhooks/whatsapp: Meta signs every product's webhooks (WhatsApp, Messenger, Instagram)
// with the app secret, and the stored payload is routed by its `object` when it is processed. Use this URL for
// the Messenger (Page) and Instagram webhooks of the Meta app.
export { GET, POST } from "../whatsapp/route";
