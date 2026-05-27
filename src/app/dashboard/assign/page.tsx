import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { AssignDashboard } from "./assign-client";
import { CATEGORY_KEYS, type ServiceCategoryKey } from "@/lib/categories";

export const metadata = { title: "Assignment queue — MBD Clinic OS" };

export default async function AssignPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:assign_therapist")) {
    redirect("/dashboard");
  }

  const centreId = await activeCentreId();

  const drafts = await prisma.client.findMany({
    where: {
      status: "DRAFT",
      ...(centreId ? { centreId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      intakeForms: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const therapistsAndConsultants = await prisma.staff.findMany({
    where: {
      isActive: true,
      role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
      ...(centreId ? { centreId } : {}),
    },
    orderBy: { name: "asc" },
    include: { department: { select: { name: true } } },
  });

  const referralSources = await prisma.referralSource.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <AssignDashboard
      drafts={drafts.map((c) => ({
        id: c.id,
        clientCode: c.clientCode,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        age: c.age,
        sex: c.sex,
        email: c.email,
        createdAt: c.createdAt.toISOString(),
        selectedCategories: parseSelected(c.intakeForms[0]?.selectedCategories ?? null),
        intakeFormId: c.intakeForms[0]?.id ?? null,
      }))}
      therapists={therapistsAndConsultants.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        designation: s.designation,
        department: s.department?.name ?? null,
      }))}
      referralSources={referralSources.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}

function parseSelected(json: string | null): ServiceCategoryKey[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      return arr.filter((k): k is ServiceCategoryKey =>
        (CATEGORY_KEYS as readonly string[]).includes(k as string),
      );
    }
  } catch {
    /* ignore */
  }
  return [];
}
