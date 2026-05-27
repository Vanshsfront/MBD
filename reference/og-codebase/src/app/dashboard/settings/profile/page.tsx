import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "./profile-client";

export const metadata = { title: "Profile — MBD Clinic OS" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const staff = await prisma.staff.findUnique({
    where: { id: session.user.id },
    include: {
      department: { select: { name: true } },
      centre: { select: { name: true, slug: true } },
    },
  });
  if (!staff) redirect("/login");

  return (
    <ProfileView
      name={staff.name}
      email={staff.email}
      role={staff.role}
      designation={staff.designation}
      department={staff.department?.name ?? null}
      centre={staff.centre?.name ?? null}
      hasSignature={!!staff.signatureDataUrl}
      signatureDataUrl={staff.signatureDataUrl}
    />
  );
}
