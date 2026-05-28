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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      centreId: string | null;
      departmentId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    centreId: string | null;
    departmentId: string | null;
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
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const staff = await prisma.staff.findUnique({
          where: { email: email.toLowerCase() },
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
        };
        token.id = u.id;
        token.role = u.role;
        token.centreId = u.centreId;
        token.departmentId = u.departmentId;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as {
        id?: string;
        role?: Role;
        centreId?: string | null;
        departmentId?: string | null;
      };
      session.user.id = t.id ?? "";
      session.user.role = t.role ?? "THERAPIST";
      session.user.centreId = t.centreId ?? null;
      session.user.departmentId = t.departmentId ?? null;
      return session;
    },
  },
});
