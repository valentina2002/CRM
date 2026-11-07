import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Local secrets live in .env.local (never committed). On Vercel the env vars are injected directly.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder lets `prisma generate` run before DATABASE_URL exists; migrate/seed need the real one.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
    // Only needed with the local `prisma dev` server (its main DB is template1). Unset on Neon.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
