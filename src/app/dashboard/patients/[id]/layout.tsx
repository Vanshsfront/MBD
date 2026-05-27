import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      doctorAssignments: {
        where: { endedAt: null },
        include: { staff: { select: { id: true, name: true } } },
      },
    },
  });
  if (!client) notFound();

  // Enforce assigned-only visibility for clinical roles (PRD §3.2 Q1).
  if (isClinicalRole(session.user.role)) {
    const assigned = client.doctorAssignments.some((a) => a.staffId === session.user.id);
    if (!assigned) redirect("/dashboard/patients");
  }

  const tabs = [
    { href: `/dashboard/patients/${id}`, label: "Overview" },
    { href: `/dashboard/patients/${id}/clinical`, label: "Clinical record" },
    { href: `/dashboard/patients/${id}/packages`, label: "Packages" },
    { href: `/dashboard/patients/${id}/invoices`, label: "Invoices" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.firstName} {client.lastName}
          </h1>
          <Badge variant={client.status === "ACTIVE" ? "success" : "default"}>
            {client.status}
          </Badge>
          <span className="text-sm text-muted-foreground">{client.clientCode}</span>
        </div>
        <nav className="flex flex-wrap gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
