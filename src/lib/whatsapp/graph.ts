import "server-only";

// Minimal WhatsApp Cloud API / Graph API client. Version from META_GRAPH_VERSION (v27.0 as of nov 2026).

const version = () => process.env.META_GRAPH_VERSION || "v27.0";
const base = () => `https://graph.facebook.com/${version()}`;

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

type GraphOptions = { token: string; method?: "GET" | "POST" | "DELETE"; json?: unknown; form?: FormData; query?: Record<string, string> };

/** Generic Graph API call (also used by the Messenger / Instagram client in src/lib/meta). */
export async function graph<T>(path: string, { token, method = "GET", json, form, query }: GraphOptions): Promise<T> {
  const url = new URL(`${base()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : form,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok || data.error) {
    const e = data.error;
    throw new GraphError(e?.error_user_msg || e?.message || `Error ${res.status} de Meta`, res.status, e?.code ?? null);
  }
  return data as T;
}

type SendResponse = { messages?: { id: string }[] };
const wamidOf = (r: SendResponse) => {
  const id = r.messages?.[0]?.id;
  if (!id) throw new GraphError("Meta no devolvió el id del mensaje", 502, null);
  return id;
};

export async function sendText(token: string, phoneNumberId: string, to: string, body: string) {
  const r = await graph<SendResponse>(`${phoneNumberId}/messages`, {
    token,
    method: "POST",
    json: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: true } },
  });
  return wamidOf(r);
}

export async function sendTemplate(token: string, phoneNumberId: string, to: string, name: string, language: string, bodyParams: string[]) {
  const components = bodyParams.length ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] : undefined;
  const r = await graph<SendResponse>(`${phoneNumberId}/messages`, {
    token,
    method: "POST",
    json: { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: language }, components } },
  });
  return wamidOf(r);
}

export async function uploadMedia(token: string, phoneNumberId: string, file: Uint8Array, mimeType: string, fileName: string) {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  form.set("file", new Blob([new Uint8Array(file)], { type: mimeType }), fileName);
  const r = await graph<{ id: string }>(`${phoneNumberId}/media`, { token, method: "POST", form });
  return r.id;
}

export async function sendDocument(token: string, phoneNumberId: string, to: string, mediaId: string, fileName: string, caption?: string) {
  const r = await graph<SendResponse>(`${phoneNumberId}/messages`, {
    token,
    method: "POST",
    json: { messaging_product: "whatsapp", to, type: "document", document: { id: mediaId, filename: fileName, caption } },
  });
  return wamidOf(r);
}

/** Blue ticks for the customer (best effort). */
export async function markRead(token: string, phoneNumberId: string, wamid: string) {
  await graph(`${phoneNumberId}/messages`, { token, method: "POST", json: { messaging_product: "whatsapp", status: "read", message_id: wamid } });
}

export type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  components: { type: string; text?: string; format?: string }[];
};

export async function listApprovedTemplates(token: string, wabaId: string) {
  const r = await graph<{ data: Template[] }>(`${wabaId}/message_templates`, {
    token,
    query: { fields: "name,language,category,status,components", status: "APPROVED", limit: "100" },
  });
  return r.data;
}

/** Embedded Signup: exchanges the 30-second `code` for a business token. */
export async function exchangeCode(code: string) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new GraphError("Faltan META_APP_ID / META_APP_SECRET", 500, null);
  const url = new URL(`${base()}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("code", code);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string; code?: number } };
  if (!res.ok || !data.access_token) throw new GraphError(data.error?.message || "No se pudo obtener el token de Meta", res.status, data.error?.code ?? null);
  return data.access_token;
}

export async function subscribeApp(token: string, wabaId: string) {
  await graph(`${wabaId}/subscribed_apps`, { token, method: "POST" });
}

export type PhoneInfo = { id: string; display_phone_number?: string; verified_name?: string; is_on_biz_app?: boolean; platform_type?: string };

export async function getPhoneNumber(token: string, phoneNumberId: string) {
  return graph<PhoneInfo>(phoneNumberId, { token, query: { fields: "display_phone_number,verified_name,is_on_biz_app,platform_type" } });
}

export async function listPhoneNumbers(token: string, wabaId: string) {
  const r = await graph<{ data: PhoneInfo[] }>(`${wabaId}/phone_numbers`, { token, query: { fields: "display_phone_number,verified_name" } });
  return r.data;
}

/** Coexistence: starts the one-time contacts or history sync (must be within 24 h of onboarding). */
export async function requestSmbSync(token: string, phoneNumberId: string, syncType: "smb_app_state_sync" | "history") {
  const r = await graph<{ request_id?: string }>(`${phoneNumberId}/smb_app_data`, {
    token,
    method: "POST",
    json: { messaging_product: "whatsapp", sync_type: syncType },
  });
  return r.request_id ?? null;
}
