// Edge-safe NextAuth config (no Prisma, no bcryptjs).
//
// Used by middleware.ts which runs in the edge runtime. The full credentials
// authorize() lives in `src/lib/auth.ts` (Node runtime, with Prisma).

import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

export const authEdgeConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Empty providers — providers (and their authorize fns) are not invoked
  // in middleware; only token reading is.
  providers: [],
};

export const { auth: authEdge } = NextAuth(authEdgeConfig);
