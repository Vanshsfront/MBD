import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, type Role } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { StaffAdminView } from "./staff-client";

export const metadata = { title: "Staff — MBD Clinic OS" };

export default async function StaffAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role as Role, "admin:manage_staff")) redirect("/dashboard");

  const [staff, departments] = await Promise.all([
    prisma.staff.findMany({
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
      include: { department: { select: { id: true, name: true } } },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <StaffAdminView
      departments={departments}
      staff={staff.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        designation: s.designation,
        isActive: s.isActive,
        departmentId: s.departmentId,
        department: s.department,
      }))}
    />
  );
}
