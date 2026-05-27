import { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    departmentId?: string | null;
    departmentName?: string | null;
    designation?: string | null;
  }

  interface Session {
    user: User & {
      id: string;
      role: Role;
      departmentId?: string | null;
      departmentName?: string | null;
      designation?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    departmentId?: string | null;
    departmentName?: string | null;
    designation?: string | null;
  }
}
