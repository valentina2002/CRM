import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const TIME_ZONE = "America/Bogota";
const LOCALE = "es-CO";

const copFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** 2400000 → "$ 2.400.000" */
export function formatCOP(value: number | null | undefined): string {
  return copFormatter.format(value ?? 0);
}

const dateParts = (timeZone: string) =>
  new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone });

function joinDateParts(fmt: Intl.DateTimeFormat, date: Date): string {
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month").replace(".", "")} ${get("year")}`;
}

/** A moment in time shown in Bogotá: "06 nov 2026". */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return joinDateParts(dateParts(TIME_ZONE), new Date(value));
}

/**
 * A calendar date stored as `@db.Date` (UTC midnight, e.g. invoice issue/due dates) or "YYYY-MM-DD".
 * Formatted in UTC so it never shifts a day back because of the Bogotá offset.
 */
export function formatDay(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return joinDateParts(dateParts("UTC"), date);
}

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

/** "17:05" in Bogotá time. */
export function formatTime(value: Date | string): string {
  return timeFormatter.format(new Date(value));
}

/** "06 nov 2026 · 17:05" in Bogotá. */
export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** Feed-style time: "17:05" if it is today in Bogotá, otherwise "06 nov". */
export function formatShortMoment(value: Date | string, now: Date = new Date()): string {
  const date = new Date(value);
  if (todayISO(date) === todayISO(now)) return formatTime(date);
  return formatDate(date).split(" ").slice(0, 2).join(" ");
}

/** ISO 8601 with the Bogotá offset (fixed UTC−5, no daylight saving): "2026-11-06T20:00:00-05:00". */
export function toBogotaISO(value: Date | string): string {
  const shifted = new Date(new Date(value).getTime() - 5 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}-05:00`;
}

/** Today's calendar date in Bogotá as "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** Adds days to a "YYYY-MM-DD" date and returns "YYYY-MM-DD". */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date at UTC midnight, the value Prisma expects for `@db.Date`. */
export function isoToDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * Normalizes a phone number to E.164 ("+573005550102"). Numbers without a country code are
 * assumed Colombian. Returns null when the input is not a valid number.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry: CountryCode = "CO"): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  // WhatsApp wa_id comes without "+" but always with the country code.
  const candidate = !digits.startsWith("+") && digits.length > 10 ? `+${digits}` : digits;
  const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
  return parsed?.isValid() ? parsed.number : null;
}

/** "+573005550102" → "+57 300 5550102" (international format for display). */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

export type TemplateVars = {
  nombre?: string;
  empresa?: string;
  factura?: string;
  valor?: string;
  vence?: string;
};

/** Replaces {nombre} {empresa} {factura} {valor} {vence}; unknown or missing variables become "". */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{(nombre|empresa|factura|valor|vence)\}/g, (_, key: keyof TemplateVars) => vars[key] ?? "");
}

/** First name, used by {nombre}. */
export function firstName(fullName: string | null | undefined): string {
  return String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Andrea Morales" → "AM" */
export function initials(name: string | null | undefined): string {
  return (
    String(name ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}
