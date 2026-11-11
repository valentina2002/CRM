import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizePhone } from "@/lib/format";

// Public lead capture forms: pure validation and helpers (the DB side is src/lib/services/lead-forms.ts).

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Max submissions from the same IP (all forms) in RATE_WINDOW_MS. */
export const RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 10 * 60_000;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/**
 * What a visitor sends. `website` is a honeypot (hidden field bots fill in). Phone OR email is required, and
 * the consent checkbox (Colombian personal data law, Ley 1581 de 2012) must be ticked.
 */
export const leadSubmissionSchema = z
  .object({
    name: z.string({ error: "Escribe tu nombre" }).trim().min(2, "Escribe tu nombre").max(120),
    company: text(160),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        const e164 = normalizePhone(v);
        if (!e164) {
          ctx.addIssue({ code: "custom", message: "Escribe un número de WhatsApp válido" });
          return z.NEVER;
        }
        return e164;
      }),
    email: z
      .union([z.literal(""), z.email("Escribe un correo válido").trim().toLowerCase()])
      .optional()
      .transform((v) => v || null),
    message: text(2000),
    consent: z.union([z.literal("on"), z.literal("true"), z.literal(true)], { error: "Debes autorizar el tratamiento de tus datos" }),
    website: z.string().max(200).optional(),
    page_url: text(500),
    ...Object.fromEntries(UTM_KEYS.map((k) => [k, text(120)])),
  })
  .superRefine((v, ctx) => {
    if (!v.phone && !v.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "Déjanos tu WhatsApp o tu correo para contactarte" });
  });
export type LeadSubmission = z.output<typeof leadSubmissionSchema>;

/** True when the hidden honeypot field was filled (almost surely a bot). */
export const isBot = (raw: Record<string, unknown>) => typeof raw.website === "string" && raw.website.trim() !== "";

/** UTM parameters from the explicit fields, falling back to the query string of the page URL. */
export function extractUtm(fields: Record<string, unknown>, pageUrl: string | null): Utm {
  const out: Utm = {};
  let params: URLSearchParams | null = null;
  try {
    params = pageUrl ? new URL(pageUrl).searchParams : null;
  } catch {
    params = null;
  }
  for (const key of UTM_KEYS) {
    const value = (typeof fields[key] === "string" && (fields[key] as string).trim()) || params?.get(key)?.trim() || "";
    if (value) out[key] = value.slice(0, 120);
  }
  return out;
}

/** Only http(s) URLs are kept as page / redirect URLs. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The visitor's IP is never stored: only a salted hash, to rate-limit. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** First IP of X-Forwarded-For (Vercel), or X-Real-IP. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "desconocida";
}

/** Text for the "Origen" note of a submission. */
export function originSummary(formName: string, pageUrl: string | null, utm: Utm): string {
  const parts = [`Formulario: ${formName}`];
  if (pageUrl) parts.push(`Página: ${pageUrl}`);
  const utmText = Object.entries(utm)
    .map(([k, v]) => `${k.replace("utm_", "")}=${v}`)
    .join(", ");
  if (utmText) parts.push(`Campaña: ${utmText}`);
  return parts.join(" · ");
}

/** Self-contained HTML to paste on a website (works without JavaScript; the small script only adds page URL and UTMs). */
export function embedSnippet(actionUrl: string, consentText: string): string {
  const field = "display:block;width:100%;margin:4px 0 12px;padding:9px 10px;border:1px solid #cfd6df;border-radius:8px;font:inherit;box-sizing:border-box";
  return `<form action="${actionUrl}" method="POST" style="max-width:420px;font-family:system-ui,sans-serif;font-size:15px">
  <label>Nombre<input name="name" required maxlength="120" style="${field}"></label>
  <label>Empresa<input name="company" maxlength="160" style="${field}"></label>
  <label>WhatsApp<input name="phone" type="tel" placeholder="300 123 4567" maxlength="40" style="${field}"></label>
  <label>Correo<input name="email" type="email" maxlength="200" style="${field}"></label>
  <label>¿En qué te puedo ayudar?<textarea name="message" rows="3" maxlength="2000" style="${field}"></textarea></label>
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <input type="hidden" name="page_url">
  <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:12px"><input type="checkbox" name="consent" required> ${consentText}</label>
  <button type="submit" style="padding:10px 18px;border:0;border-radius:8px;background:#15803d;color:#fff;font:inherit;font-weight:600;cursor:pointer">Enviar</button>
</form>
<script>
(function(){var f=document.currentScript.previousElementSibling,q=new URLSearchParams(location.search);
f.page_url.value=location.href;["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(function(k){
if(q.get(k)){var i=document.createElement("input");i.type="hidden";i.name=k;i.value=q.get(k);f.appendChild(i);}});})();
</script>`;
}

export const consentText = (who: string) => `Autorizo a ${who} a tratar mis datos personales para contactarme, de acuerdo con la Ley 1581 de 2012.`;
