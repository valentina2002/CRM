import { createHash, randomBytes } from "node:crypto";

// API keys look like "crm_<32 url-safe characters>" (192 random bits). Only the SHA-256 hash is stored.

export const API_KEY_PREFIX = "crm_";
const KEY_PATTERN = /^crm_[A-Za-z0-9_-]{32}$/;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** New random key: the plain value (shown once), the part shown in the UI and the hash kept in the DB. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

/** Extracts a well-formed key from an `Authorization: Bearer <key>` header, or null. */
export function parseBearerKey(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match && KEY_PATTERN.test(match[1]) ? match[1] : null;
}
