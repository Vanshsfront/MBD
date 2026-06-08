// MBD Clinic OS — NextAuth v5 (beta) configuration
//
// Credentials provider, JWT sessions. session.user carries:
//   - id (Staff.id)
//   - name, email, role (Role)
//   - centreId, departmentId (nullable)
// These power RBAC checks across server components, API routes, and middleware.

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/permissions";
import { ROLES } from "@/lib/permissions";
import { consume, clientIp } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      centreId: string | null;
      departmentId: string | null;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    centreId: string | null;
    departmentId: string | null;
    sessionVersion: number;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * bcrypt cost factor used for ALL new password writes (seed, admin-create,
 * admin-reset, user self-change). bcrypt.compare reads the cost from the hash
 * itself, so existing 10-cost hashes keep validating without re-hashing — new
 * hashes just land stronger. 12 is the modern default.
 */
export const BCRYPT_COST = 12;

function asRole(value: unknown): Role {
  if (typeof value !== "string") return "THERAPIST";
  return (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : "THERAPIST";
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  // 8h session — long enough for a clinical shift, short enough that an
  // unattended kiosk doesn't stay logged in overnight. Default NextAuth was
  // 30 days, which is wildly wrong for PHI.
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "MBD",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        // Rate limit: 5 failed/successful attempts/min per email, 30/min per IP.
        // Applied BEFORE bcrypt to also blunt timing-based username enumeration.
        // Reference: audit-2026-06-06.md F-005 / AUTH-010 (High, live-confirmed).
        const ip = request instanceof Request ? clientIp(request) : "unknown";
        const emailGate = consume(`auth:email:${normalizedEmail}`, 5, 60 * 1000);
        const ipGate = consume(`auth:ip:${ip}`, 30, 60 * 1000);
        if (!emailGate.ok || !ipGate.ok) {
          // NextAuth's authorize can only signal failure by returning null —
          // throwing is treated as a generic error. Return null and let the
          // standard 302 redirect (failed-auth) cover it. The attacker sees
          // the same response as a wrong-password attempt, which is fine.
          return null;
        }

        const staff = await prisma.staff.findUnique({
          where: { email: normalizedEmail },
        });
        if (!staff || !staff.isActive) return null;

        const ok = await compare(password, staff.passwordHash);
        if (!ok) return null;

        return {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: asRole(staff.role),
          centreId: staff.centreId,
          departmentId: staff.departmentId,
          sessionVersion: staff.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          role: Role;
          centreId: string | null;
          departmentId: string | null;
          sessionVersion: number;
        };
        token.id = u.id;
        token.role = u.role;
        token.centreId = u.centreId;
        token.departmentId = u.departmentId;
        token.sessionVersion = u.sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as {
        id?: string;
        role?: Role;
        centreId?: string | null;
        departmentId?: string | null;
        sessionVersion?: number;
      };
      session.user.id = t.id ?? "";
      session.user.role = t.role ?? "THERAPIST";
      session.user.centreId = t.centreId ?? null;
      session.user.departmentId = t.departmentId ?? null;
      session.user.sessionVersion = t.sessionVersion ?? 0;
      return session;
    },
  },
});
