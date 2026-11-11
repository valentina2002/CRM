import { z } from "zod";
import { SERVICES, STAGES } from "@/lib/constants";
import { normalizePhone } from "@/lib/format";

/** Trims, drops empties and removes case-insensitive duplicates, keeping the first spelling. */
export function normalizeTags(input: string | readonly string[] | null | undefined): string[] {
  const list = typeof input === "string" ? input.split(",") : (input ?? []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = tag.toLocaleLowerCase("es-CO");
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** COP amounts: accepts "1.200.000", "1200000" or numbers; integer pesos, never negative. */
export const copAmount = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/[^\d]/g, "") || 0) : (v ?? 0)),
  z.number().int().min(0, "El valor no puede ser negativo").max(10_000_000_000, "Valor demasiado alto"),
);

const stageEnum = z.enum(STAGES.map((s) => s.value) as [string, ...string[]]);

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  company: optionalText(160),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const e164 = normalizePhone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Número de WhatsApp no válido" });
        return z.NEVER;
      }
      return e164;
    }),
  email: z
    .union([z.literal(""), z.email("Correo no válido").trim().toLowerCase()])
    .optional()
    .transform((v) => v || null),
  service: z.enum(SERVICES).nullable().optional().transform((v) => v ?? null),
  monthlyValue: copAmount,
  tags: z.union([z.string(), z.array(z.string())]).optional().transform((v) => normalizeTags(v)),
});
export type ContactInput = z.output<typeof contactInputSchema>;

export const dealInputSchema = z.object({
  contactId: z.string().min(1, "Elige un contacto"),
  title: z.string().trim().min(1, "Escribe un título").max(160),
  value: copAmount,
  stage: stageEnum,
});
export type DealInput = z.output<typeof dealInputSchema>;

export const stageChangeSchema = z.object({ dealId: z.string().min(1), stage: stageEnum });

export const taskInputSchema = z.object({
  text: z.string().trim().min(1, "Escribe la tarea").max(300),
  contactId: z.string().min(1).nullable().optional().transform((v) => v ?? null),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .nullable()
    .optional()
    .transform((v) => v || null),
});
export type TaskInput = z.output<typeof taskInputSchema>;

export const noteInputSchema = z.object({
  contactId: z.string().min(1),
  body: z.string().trim().min(1, "La nota está vacía").max(5000),
});

export const tagInputSchema = z.object({
  contactId: z.string().min(1),
  tag: z.string().trim().min(1, "Escribe una etiqueta").max(40),
});

/** First error message of a failed parse, for showing in a toast or under the form. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos";
}

// ---------- Cuentas de cobro ----------

export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Cada actividad necesita una descripción").max(300),
  quantity: z.coerce.number().int("La cantidad debe ser un número entero").min(1, "La cantidad mínima es 1").max(10000),
  unitPrice: copAmount,
});

export const invoiceInputSchema = z
  .object({
    contactId: z.string().min(1, "Elige un cliente"),
    issueDate: isoDay,
    dueDate: isoDay,
    items: z.array(invoiceItemSchema).min(1, "Agrega al menos una actividad").max(50),
    notes: optionalText(1000),
  })
  .refine((v) => v.dueDate >= v.issueDate, { message: "La fecha límite no puede ser anterior a la de emisión", path: ["dueDate"] });
export type InvoiceInput = z.output<typeof invoiceInputSchema>;

export const issuerSchema = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre completo").max(160),
  document: z.string().trim().min(1, "Escribe tu C.C. o NIT").max(60),
  city: z.string().trim().min(1, "Escribe la ciudad").max(80),
  paymentInfo: z.string().trim().max(500),
  showAmountInWords: z.boolean(),
});
export type IssuerInput = z.output<typeof issuerSchema>;

export const payInvoiceSchema = z.object({ invoiceId: z.string().min(1), paidAt: isoDay });
