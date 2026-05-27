import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FlagsAdminView } from "./flags-client";

export const metadata = { title: "Client flags — MBD Clinic OS" };

export default async function FlagsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:client_flags")) redirect("/dashboard");

  const flags = await prisma.clientFlag.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { client: { select: { id: true, firstName: true, lastName: true, clientCode: true } } },
    take: 200,
  });

  const clients = await prisma.client.findMany({
    where: { status: { in: ["ACTIVE", "INACTIVE"] } },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, clientCode: true },
    take: 200,
  });

  return (
    <FlagsAdminView
      flags={flags.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        color: f.color,
        notes: f.notes,
        isActive: f.isActive,
        createdAt: f.createdAt.toISOString(),
        clientId: f.clientId,
        clientName: `${f.client.firstName} ${f.client.lastName}`,
        clientCode: f.client.clientCode,
      }))}
      clients={clients.map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName} (${c.clientCode})`,
      }))}
    />
  );
}
