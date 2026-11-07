import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  fillTemplate,
  firstName,
  formatCOP,
  formatDate,
  formatDay,
  formatPhone,
  formatTime,
  initials,
  isoToDbDate,
  normalizePhone,
  todayISO,
} from "./format";

// Intl uses a non-breaking space between "$" and the amount.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("formatCOP", () => {
  it("formats Colombian pesos without decimals", () => {
    expect(plain(formatCOP(2400000))).toBe("$ 2.400.000");
    expect(plain(formatCOP(900000.6))).toBe("$ 900.001");
  });
  it("treats null/undefined as zero", () => {
    expect(plain(formatCOP(null))).toBe("$ 0");
    expect(plain(formatCOP(undefined))).toBe("$ 0");
  });
});

describe("dates in Bogotá", () => {
  it("formats a moment as dd mmm yyyy in Bogotá time", () => {
    // 03:00 UTC on 7 nov is still 6 nov (22:00) in Bogotá.
    expect(formatDate(new Date("2026-11-07T03:00:00Z"))).toBe("06 nov 2026");
    expect(formatDate("2026-01-15T12:00:00Z")).toBe("15 ene 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("formats @db.Date values without shifting the day", () => {
    expect(formatDay(new Date("2026-11-06T00:00:00Z"))).toBe("06 nov 2026");
    expect(formatDay("2026-12-01")).toBe("01 dic 2026");
    expect(formatDay(undefined)).toBe("—");
  });

  it("formats time as 24h in Bogotá", () => {
    expect(formatTime("2026-11-06T14:12:00Z")).toBe("09:12");
  });

  it("computes today's date in Bogotá", () => {
    expect(todayISO(new Date("2026-11-07T03:00:00Z"))).toBe("2026-11-06");
    expect(todayISO(new Date("2026-11-07T05:00:00Z"))).toBe("2026-11-07");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-11-25", 15)).toBe("2026-12-10");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoToDbDate("2026-11-06").toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });
});

describe("normalizePhone", () => {
  it("normalizes Colombian numbers to E.164", () => {
    expect(normalizePhone("+57 300 555 0102")).toBe("+573005550102");
    expect(normalizePhone("300 555 0102")).toBe("+573005550102");
    expect(normalizePhone("(300) 555-0102")).toBe("+573005550102");
  });
  it("accepts WhatsApp wa_id (country code, no plus)", () => {
    expect(normalizePhone("573005550102")).toBe("+573005550102");
  });
  it("keeps other countries", () => {
    expect(normalizePhone("+502 5555 0101")).toBe("+50255550101");
  });
  it("returns null for invalid input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
  it("formats E.164 for display", () => {
    expect(formatPhone("+573005550102")).toBe("+57 300 5550102");
    expect(formatPhone(null)).toBe("");
  });
});

describe("templates and names", () => {
  it("fills {nombre} {empresa} {factura} {valor}", () => {
    expect(
      fillTemplate("¡Gracias {nombre}! Recibimos {factura} por {valor} de {empresa}.", {
        nombre: "Andrea",
        empresa: "Megalámparas",
        factura: "CC-002",
        valor: "$ 2.400.000",
      }),
    ).toBe("¡Gracias Andrea! Recibimos CC-002 por $ 2.400.000 de Megalámparas.");
  });
  it("replaces missing variables with empty text and leaves unknown braces", () => {
    expect(fillTemplate("Hola {nombre} {otro}", {})).toBe("Hola  {otro}");
  });
  it("extracts first name and initials", () => {
    expect(firstName("Andrea Morales")).toBe("Andrea");
    expect(initials("Andrea Morales Pérez")).toBe("AM");
    expect(initials("")).toBe("?");
  });
});
