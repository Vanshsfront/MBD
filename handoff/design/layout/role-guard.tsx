// Server component: redirects to /login if no session, /dashboard if role lacks
// permission to access the requested route.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessRoute } from "@/lib/nav";
import { hasPermission, type Permission } from "@/lib/permissions";

interface RoleGuardProps {
  pathname: string;
  permission?: Permission;
  children: React.ReactNode;
}

export async function RoleGuard({ pathname, permission, children }: RoleGuardProps) {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?from=${encodeURIComponent(pathname)}`);
  }
  const role = session.user.role;
  if (permission && !hasPermission(role, permission)) {
    redirect("/dashboard");
  }
  if (!canAccessRoute(role, pathname)) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
