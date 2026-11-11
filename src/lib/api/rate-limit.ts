// Fixed one-minute window per API key. The counter lives in the ApiKey row (see authenticateApiKey).

export const RATE_WINDOW_MS = 60_000;
export const DEFAULT_RATE_LIMIT = 120;

/** Requests allowed per key per minute (API_RATE_LIMIT_PER_MINUTE, default 120). */
export function rateLimitPerMinute(raw: string | undefined = process.env.API_RATE_LIMIT_PER_MINUTE): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_RATE_LIMIT;
}

/** Start of the window that contains `now`. */
export function rateWindowStart(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / RATE_WINDOW_MS) * RATE_WINDOW_MS);
}

export type RateState = { limit: number; remaining: number; resetSeconds: number; limited: boolean };

/** `count` = requests made in the current window, including this one. */
export function rateState(count: number, limit: number, now: Date = new Date()): RateState {
  const resetMs = rateWindowStart(now).getTime() + RATE_WINDOW_MS - now.getTime();
  return { limit, remaining: Math.max(0, limit - count), resetSeconds: Math.max(1, Math.ceil(resetMs / 1000)), limited: count > limit };
}

export function rateLimitHeaders(state: RateState): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(state.limit),
    "X-RateLimit-Remaining": String(state.remaining),
    "X-RateLimit-Reset": String(state.resetSeconds),
    ...(state.limited ? { "Retry-After": String(state.resetSeconds) } : {}),
  };
}
