import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";

export type CurrentUser = { id: string; name: string; email: string };

/**
 * Data Access Layer entry point: every server component, server action or route handler that
 * touches CRM data calls this first. Reads the session cookie, so call it inside a <Suspense>.
 */
export async function requireUser(): Promise<CurrentUser> {
  await connection(); // request-time only: Auth.js uses crypto, which cannot run during prerendering
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect("/login");
  return { id: user.id, name: user.name ?? "Valentina", email: user.email ?? "" };
}

/** Same as requireUser but returns null instead of redirecting (for small UI bits like badges). */
export async function getUser(): Promise<CurrentUser | null> {
  await connection();
  const session = await auth();
  const user = session?.user;
  return user?.id ? { id: user.id, name: user.name ?? "Valentina", email: user.email ?? "" } : null;
}
