import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // No throw here: the module is also evaluated at build time. A missing DATABASE_URL fails on the first query.
  // DATABASE_POOL_MAX=1 for the local `prisma dev` server (PGlite serves one connection at a time).
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max }) });
}

/** Single Prisma client per server process (reused across hot reloads in dev). */
export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
