import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = credentials?.email as string | undefined;
          const password = credentials?.password as string | undefined;

          if (!email || !password) {
            return null;
          }

          const staff = await prisma.staff.findUnique({
            where: { email },
            include: { department: true },
          });

          if (!staff || !staff.isActive) {
            return null;
          }

          const isValid = await bcrypt.compare(password, staff.passwordHash);

          if (!isValid) {
            return null;
          }

          return {
            id: staff.id,
            email: staff.email,
            name: staff.name,
            role: staff.role,
            departmentId: staff.departmentId || "",
            departmentName: staff.department?.name || "",
            designation: staff.designation || "",
          };
        } catch (error) {
          console.error("[auth] authorize error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.role = u.role as string;
        token.departmentId = u.departmentId as string;
        token.departmentName = u.departmentName as string;
        token.designation = u.designation as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const su = session.user as any;
        su.id = token.id;
        su.role = token.role;
        su.departmentId = token.departmentId;
        su.departmentName = token.departmentName;
        su.designation = token.designation;
      }
      return session;
    },
  },
  trustHost: true,
});
