import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { StaffAdminView } from "./staff-client";

export const metadata = { title: "Staff — MBD Clinic OS" };

export default async function StaffAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_staff")) redirect("/dashboard");

  const staff = await prisma.staff.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { department: { select: { name: true } } },
  });

  return (
    <StaffAdminView
      staff={staff.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        designation: s.designation,
        department: s.department?.name ?? null,
        isActive: s.isActive,
      }))}
    />
  );
}
