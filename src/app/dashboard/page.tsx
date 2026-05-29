import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isClinicalRole, isManagementRole, type Role } from "@/lib/permissions";
import { activeCentreId } from "@/lib/centre";
import { TherapistDashboard } from "./_dashboards/therapist";
import { FrontOfficeDashboard } from "./_dashboards/front-office";
import { OwnerDashboard } from "./_dashboards/owner";
import { AdminDashboard } from "./_dashboards/admin";

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
  if (role === "ADMIN") {
    // ADMIN gets a dedicated landing (operations + compliance) rather than
    // the Owner's revenue overview. See _dashboards/admin.tsx top-comment
    // for the audit rationale.
    return (
      <AdminDashboard
        userName={session.user.name ?? "Admin"}
        role={role}
        centreId={centreId}
      />
    );
  }
  // OWNER, DEV.
  return (
    <OwnerDashboard
      userName={session.user.name ?? "Owner"}
      role={role}
      centreId={centreId}
      isManagement={isManagementRole(role) || role === "DEV"}
    />
  );
}
