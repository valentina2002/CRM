import { z } from "zod";
import type { Stage } from "@/generated/prisma/enums";
import { STAGES } from "@/lib/constants";
import { addDaysISO, normalizePhone, todayISO } from "@/lib/format";
import { contactInputSchema, copAmount, invoiceInputSchema, isoDay } from "@/lib/validation";

// Zod schemas for the public REST API (/api/v1). They reuse the same rules as the UI forms
// (src/lib/validation.ts) and only adapt what a JSON client sends (nulls, optional fields, defaults).

const spanish = z.locales.es().localeError;

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Accepts the enum value ("NEGOTIATION") or the Spanish label ("Negociación"), like the prototype did. */
export function parseStage(value: unknown): Stage | null {
  if (typeof value !== "string") return null;
  const wanted = fold(value);
  return STAGES.find((s) => s.value.toLowerCase() === wanted || fold(s.label) === wanted)?.value ?? null;
}

const STAGE_ERROR = `Etapa inválida. Usa una de: ${STAGES.map((s) => s.value).join(", ")}`;

const stage = z.unknown().transform((v, ctx) => {
  const parsed = parseStage(v);
  if (!parsed) {
    ctx.addIssue({ code: "custom", message: STAGE_ERROR });
    return z.NEVER;
  }
  return parsed;
});

/** "YYYY-MM-DD" that is also a real calendar day. */
const day = isoDay.refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Fecha inválida");

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON clients send null to clear a field; the form schema expects "" for phone and email. */
const contactBody = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  return { ...raw, phone: raw.phone ?? "", email: raw.email ?? "" };
}, contactInputSchema);

export const CONTACT_FIELDS = ["name", "company", "phone", "email", "service", "tags", "monthlyValue"] as const;

export function parseContactCreate(raw: unknown) {
  return contactBody.safeParse(raw, { error: spanish });
}

/** PATCH: only the fields present in the body change; the rest keep their current value. */
export function parseContactPatch(current: Record<(typeof CONTACT_FIELDS)[number], unknown>, raw: unknown) {
  const hasField = isRecord(raw) && CONTACT_FIELDS.some((k) => k in raw);
  const merged: Record<string, unknown> = {};
  for (const key of CONTACT_FIELDS) merged[key] = isRecord(raw) && key in raw ? raw[key] : current[key];
  return contactBody
    .refine(() => hasField, `Envía al menos un campo para actualizar: ${CONTACT_FIELDS.join(", ")}`)
    .safeParse(merged, { error: spanish });
}

const dealCreate = z.object({
  contactId: z.string().min(1, "contactId es obligatorio"),
  title: z.string().trim().min(1, "title es obligatorio").max(160),
  value: copAmount,
  stage: stage.optional().transform((v) => v ?? ("PROSPECT" as Stage)),
});
export const parseDealCreate = (raw: unknown) => dealCreate.safeParse(raw, { error: spanish });

const dealPatch = z
  .object({
    stage: stage.optional(),
    value: z.number().int().min(0, "El valor no puede ser negativo").max(10_000_000_000).optional(),
    title: z.string().trim().min(1).max(160).optional(),
  })
  .refine((v) => v.stage !== undefined || v.value !== undefined || v.title !== undefined, "Envía stage, value o title");
export const parseDealPatch = (raw: unknown) => dealPatch.safeParse(raw, { error: spanish });

const messageCreate = z
  .object({
    contactId: z.string().trim().max(60).optional().transform((v) => v || undefined),
    to: z.string().trim().max(40).optional(),
    text: z.string().trim().min(1, "text es obligatorio").max(4096, "El texto no puede superar 4096 caracteres"),
  })
  .transform((v, ctx) => {
    if (v.contactId) return { contactId: v.contactId, to: null, text: v.text };
    const to = normalizePhone(v.to);
    if (!to) {
      ctx.addIssue({ code: "custom", message: v.to ? "to no es un número de WhatsApp válido (usa formato E.164)" : "Envía contactId o to" });
      return z.NEVER;
    }
    return { contactId: null, to, text: v.text };
  });
export const parseMessageCreate = (raw: unknown) => messageCreate.safeParse(raw, { error: spanish });

/** issueDate defaults to today (Bogotá) and dueDate to 15 days later, like the editor in the UI. */
const invoiceCreate = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const issueDate = typeof raw.issueDate === "string" ? raw.issueDate : todayISO();
  const dueDate = raw.dueDate ?? (day.safeParse(issueDate).success ? addDaysISO(issueDate, 15) : issueDate);
  return { ...raw, issueDate, dueDate };
}, invoiceInputSchema.and(z.object({ issueDate: day, dueDate: day })));
export const parseInvoiceCreate = (raw: unknown) => invoiceCreate.safeParse(raw, { error: spanish });

const invoicePay = z.object({ paidAt: day.optional() }).transform((v) => ({ paidAt: v.paidAt ?? todayISO() }));
export const parseInvoicePay = (raw: unknown) => invoicePay.safeParse(raw ?? {}, { error: spanish });

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "OVERDUE"] as const;

const page = z.coerce.number().int().min(1).max(100_000).catch(1);
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const contactQuery = z.object({ q: text(120), tag: text(40), page });
const dealQuery = z.object({ stage: stage.optional(), contactId: text(60) });
const invoiceQuery = z.object({
  status: z.enum(INVOICE_STATUSES, `status debe ser uno de: ${INVOICE_STATUSES.join(", ")}`).optional(),
  contactId: text(60),
});
const messageQuery = z.object({ limit: z.coerce.number().int().min(1).max(300).catch(100) });

const fromSearch = (params: URLSearchParams) => Object.fromEntries([...params].filter(([, v]) => v !== ""));

export const parseContactQuery = (p: URLSearchParams) => contactQuery.safeParse(fromSearch(p), { error: spanish });
export const parseDealQuery = (p: URLSearchParams) => dealQuery.safeParse(fromSearch(p), { error: spanish });
export const parseInvoiceQuery = (p: URLSearchParams) => invoiceQuery.safeParse(fromSearch(p), { error: spanish });
export const parseMessageQuery = (p: URLSearchParams) => messageQuery.safeParse(fromSearch(p), { error: spanish });

/** `{ error, details }` body for a 422: the first problem as the message, all of them in details. */
export function validationError(error: z.ZodError): { error: string; details: { field: string; message: string }[] } {
  const details = error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
  const first = details[0];
  return { error: first ? (first.field ? `${first.field}: ${first.message}` : first.message) : "Datos inválidos", details };
}
