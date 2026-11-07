import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe part of the Auth.js config (no DB access). Used by proxy.ts for the optimistic
 * "logged in?" check; the full config with the Credentials provider lives in auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const loggedIn = Boolean(auth?.user);
      if (nextUrl.pathname === "/login") {
        return loggedIn ? Response.redirect(new URL("/tablero", nextUrl)) : true;
      }
      return loggedIn; // false → redirect to /login
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
