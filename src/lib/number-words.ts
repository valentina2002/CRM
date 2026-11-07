// Integer → Spanish words, for "Son: … pesos M/CTE" on cuentas de cobro.
// The number always precedes a noun ("pesos", "mil", "millones"), so 1 becomes "un" (apocope):
// 21 → "veintiún", 101 → "ciento un", 1000 → "mil", 1_000_000 → "un millón".

const UNITS = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const TEENS = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
const TWENTIES = ["veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function belowHundred(n: number): string {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 30) return TWENTIES[n - 20];
  const unit = n % 10;
  return unit ? `${TENS[Math.floor(n / 10)]} y ${UNITS[unit]}` : TENS[Math.floor(n / 10)];
}

function belowThousand(n: number): string {
  if (n === 100) return "cien";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [HUNDREDS[hundreds], belowHundred(rest)].filter(Boolean).join(" ");
}

function belowMillion(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 0 ? "" : thousands === 1 ? "mil" : `${belowThousand(thousands)} mil`;
  return [head, belowThousand(rest)].filter(Boolean).join(" ");
}

/** 2_400_000 → "dos millones cuatrocientos mil". Supports 0 to 999.999.999.999. */
export function numberToSpanishWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "cero";
  if (n >= 1e12) throw new RangeError("Número demasiado grande");
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const head = millions === 0 ? "" : millions === 1 ? "un millón" : `${belowMillion(millions)} millones`;
  return [head, belowMillion(rest)].filter(Boolean).join(" ");
}

/** "DOS MILLONES CUATROCIENTOS MIL PESOS M/CTE" ("… de pesos" after exact millions). */
export function amountInWordsCOP(value: number): string {
  const n = Math.floor(Math.abs(value));
  const words = numberToSpanishWords(n);
  const exactMillions = n >= 1_000_000 && n % 1_000_000 === 0;
  return `${words}${exactMillions ? " de" : ""} ${n === 1 ? "peso" : "pesos"} M/CTE`.toLocaleUpperCase("es-CO");
}
