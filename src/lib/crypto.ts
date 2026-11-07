import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM for secrets stored in the DB (channel access tokens). Format: "v1:<iv>:<tag>:<ciphertext>" (base64url).

function key(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("Falta ENCRYPTION_KEY (32 bytes en base64)");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY debe tener 32 bytes en base64");
  return buf;
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Secreto cifrado con formato inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "sha256=<hex>" HMAC of the raw body, as Meta sends in X-Hub-Signature-256 (and we send in X-CRM-Signature). */
export function hmacSha256Header(rawBody: string | Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Verifies Meta's X-Hub-Signature-256 against the RAW request body with the app secret. */
export function verifyMetaSignature(rawBody: string | Buffer, header: string | null, appSecret: string | undefined): boolean {
  if (!header || !appSecret) return false;
  return safeEqual(header.trim(), hmacSha256Header(rawBody, appSecret));
}
