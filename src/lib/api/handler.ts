import "server-only";
import { after } from "next/server";
import type { z } from "zod";
import { DomainError } from "@/lib/services/core";
import { authenticateApiKey } from "@/lib/services/api-keys";
import { runBackgroundWork } from "@/lib/services/pipeline";
import { parseBearerKey } from "./keys";
import { rateLimitHeaders, rateLimitPerMinute, rateState } from "./rate-limit";
import { validationError } from "./schemas";

/** Error with an HTTP status that is safe to show to the API client (Spanish message). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiContext<P> = { request: Request; url: URL; params: P; apiKey: { id: string; name: string } };

const DOMAIN_STATUS = { not_found: 404, conflict: 409, invalid: 422 } as const;

const errorJson = (status: number, error: string, extra?: Record<string, unknown>, headers?: HeadersInit) =>
  Response.json({ error, ...extra }, { status, headers });

/** `{ data, ...extra }` response. */
export function ok(data: unknown, extra: Record<string, unknown> = {}, status = 200) {
  return Response.json({ data, ...extra }, { status });
}

/** Reads a JSON object body. An empty body counts as `{}` (for endpoints whose body is optional). */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "El body no es un JSON válido");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ApiError(400, "El body debe ser un objeto JSON");
  return parsed as Record<string, unknown>;
}

/** Unwraps a Zod result or answers 422 with the first problem (and all of them in `details`). */
export function valid<T>(result: z.ZodSafeParseResult<T>): T {
  if (result.success) return result.data;
  const body = validationError(result.error);
  throw new ApiError(422, body.error, { details: body.details });
}

/**
 * Wraps a /api/v1 route handler: API key (Bearer) → rate limit → handler → errors as `{ error }` JSON.
 * After a successful write, the events it emitted (automations, WhatsApp, outgoing webhooks) are processed
 * once the response has been sent.
 */
export function apiRoute<P = Record<string, never>>(handler: (ctx: ApiContext<P>) => Promise<Response>) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    const key = parseBearerKey(request.headers.get("authorization"));
    const unauthorized = () =>
      errorJson(401, "Falta la API key o no es válida. Envía el header Authorization: Bearer <API_KEY>.", undefined, { "WWW-Authenticate": "Bearer" });
    if (!key) return unauthorized();

    let rateHeaders: Record<string, string>;
    let apiKey: { id: string; name: string };
    try {
      const auth = await authenticateApiKey(key);
      if (!auth) return unauthorized();
      const state = rateState(auth.count, rateLimitPerMinute());
      rateHeaders = rateLimitHeaders(state);
      if (state.limited) {
        return errorJson(429, `Demasiadas peticiones: el límite es ${state.limit} por minuto. Intenta de nuevo en ${state.resetSeconds} s.`, undefined, rateHeaders);
      }
      apiKey = { id: auth.id, name: auth.name };
    } catch (error) {
      console.error("API: error validando la API key", error);
      return errorJson(500, "Error interno del servidor");
    }

    let response: Response;
    try {
      response = await handler({ request, url: new URL(request.url), params: await context.params, apiKey });
    } catch (error) {
      if (error instanceof ApiError) response = errorJson(error.status, error.message, error.extra);
      else if (error instanceof DomainError) response = errorJson(DOMAIN_STATUS[error.code], error.message);
      else {
        console.error(`API: error en ${request.method} ${new URL(request.url).pathname}`, error);
        response = errorJson(500, "Error interno del servidor");
      }
    }

    if (request.method !== "GET" && response.ok) {
      after(() => runBackgroundWork().catch((error) => console.error("API: error en el trabajo en segundo plano", error)));
    }
    for (const [name, value] of Object.entries(rateHeaders)) response.headers.set(name, value);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
