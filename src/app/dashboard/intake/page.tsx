import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { IntakePageClient } from "./intake-client";

export const metadata = { title: "New intake — MBD Clinic OS" };

export default async function IntakePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:generate_intake_qr")) {
    redirect("/dashboard");
  }

  // Lazy expire here too so the page always shows fresh status.
  const now = new Date();
  await prisma.intakeToken.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const centreId = await activeCentreId();
  const tokens = await prisma.intakeToken.findMany({
    where: { ...(centreId ? { centreId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <IntakePageClient
      initialTokens={tokens.map((t) => ({
        id: t.id,
        token: t.token,
        status: t.status as "PENDING" | "COMPLETED" | "EXPIRED",
        expiresAt: t.expiresAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        createdBy: t.createdBy?.name ?? null,
        clientId: t.clientId,
      }))}
    />
  );
}
