import NextAuth from "next-auth";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Called directly (no inner handler) so a false `authorized` callback redirects to /login.
// next-auth v5 beta types `auth` as overloaded; at runtime this call form is the middleware/proxy.
const authProxy = auth as unknown as NextMiddleware;

/**
 * Optimistic check only (redirects to /login without a valid session cookie).
 * Real authorization happens close to the data via requireUser() in src/lib/session.ts.
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  return authProxy(request, event);
}

export const config = {
  // Everything except Auth.js endpoints, public API/webhooks/forms (their own auth), public form pages (/f/…) and static files.
  matcher: ["/((?!api/|f/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
