import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isClinicalRole, isManagementRole, type Role } from "@/lib/permissions";
import { activeCentreId } from "@/lib/centre";
import { TherapistDashboard } from "./_dashboards/therapist";
import { FrontOfficeDashboard } from "./_dashboards/front-office";
import { OwnerDashboard } from "./_dashboards/owner";

export const metadata = { title: "Dashboard — MBD Clinic OS" };

export default async function DashboardHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  const centreId = await activeCentreId();

  if (isClinicalRole(role)) {
    return (
      <TherapistDashboard
        currentUserId={session.user.id}
        userName={session.user.name ?? "you"}
        role={role}
      />
    );
  }
  if (role === "FRONT_OFFICE") {
    return (
      <FrontOfficeDashboard
        userName={session.user.name ?? "Front office"}
        centreId={centreId}
      />
    );
  }
  // OWNER, ADMIN, DEV.
  return (
    <OwnerDashboard
      userName={session.user.name ?? "Owner"}
      role={role}
      centreId={centreId}
      isManagement={isManagementRole(role) || role === "DEV"}
    />
  );
}
