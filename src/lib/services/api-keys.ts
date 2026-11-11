import "server-only";
import { generateApiKey, hashApiKey } from "@/lib/api/keys";
import { rateWindowStart } from "@/lib/api/rate-limit";
import { db } from "@/lib/db";
import { DomainError, logActivity } from "./core";

/** Creates a key. The plain value is returned here and never again (only its hash is stored). */
export async function createApiKey(name: string) {
  const { key, prefix, hash } = generateApiKey();
  const row = await db.$transaction(async (tx) => {
    const created = await tx.apiKey.create({ data: { name, prefix, hash } });
    await logActivity(tx, { type: "api_key.created", text: `API key creada: ${name}` });
    return created;
  });
  return { id: row.id, name: row.name, prefix: row.prefix, key };
}

export async function listApiKeys() {
  return db.apiKey.findMany({
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
}

export async function revokeApiKey(id: string) {
  const key = await db.apiKey.findUnique({ where: { id } });
  if (!key) throw new DomainError("API key no encontrada", "not_found");
  if (key.revokedAt) return;
  await db.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await logActivity(tx, { type: "api_key.revoked", text: `API key revocada: ${key.name}` });
  });
}

/**
 * Looks the key up by hash and, in the same statement, counts the request in its one-minute window and
 * stamps lastUsedAt. Returns null for unknown or revoked keys. `count` includes this request.
 */
export async function authenticateApiKey(key: string, now: Date = new Date()) {
  const windowStart = rateWindowStart(now);
  const rows = await db.$queryRaw<{ id: string; name: string; rateCount: number }[]>`
    UPDATE "ApiKey"
    SET "rateCount" = CASE WHEN "rateWindowStart" = ${windowStart}::timestamp THEN "rateCount" + 1 ELSE 1 END,
        "rateWindowStart" = ${windowStart}::timestamp,
        "lastUsedAt" = ${now}::timestamp
    WHERE "hash" = ${hashApiKey(key)} AND "revokedAt" IS NULL
    RETURNING "id", "name", "rateCount"`;
  const row = rows[0];
  return row ? { id: row.id, name: row.name, count: Number(row.rateCount) } : null;
}
