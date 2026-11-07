import "server-only";
import { refresh } from "next/cache";
import { DomainError } from "@/lib/services/core";
import { requireUser } from "@/lib/session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Wraps a server action body: checks the session (redirects to /login if missing), runs the
 * mutation, refreshes the client router, and turns DomainErrors into a Spanish message.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireUser();
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Algo salió mal. Intenta de nuevo." };
  }
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
