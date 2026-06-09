import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { groupNav, navItemsFor, SECTION_LABELS } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";
import { activeCentreId, canSwitch } from "@/lib/centre";
import { NotificationBell } from "@/components/layout/notification-bell";
import { CommandPalette } from "@/components/layout/command-palette";
import { CentreSwitcher } from "@/components/layout/centre-switcher";
import { SearchTrigger } from "@/components/layout/search-trigger";
import { NavLink, type NavIconKey } from "@/components/layout/nav-link";
import type { Role } from "@/lib/permissions";

// Dashboard shell — warm, neumorphic chrome matching the legacy codebase.
// The whole shell sits on .bg-gradient-app so the warm cream gradient shows
// in the gutters; the sidebar is a white surface with a hairline ring; the
// active nav item is a soft dark pill (rendered by NavLink, which is a
// client component so it follows client-side navigation correctly — see
// nav-link.tsx for why this can't be derived from a server prop).

export async function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  const items = navItemsFor(role);
  const grouped = groupNav(items);

  const userCanSwitch = canSwitch(role);
  const activeCentre = await activeCentreId();
  const centres = userCanSwitch
    ? await prisma.centre.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const activeSlug = activeCentre
    ? (await prisma.centre.findUnique({
        where: { id: activeCentre },
        select: { slug: true, name: true },
      }))
    : null;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-gradient-app md:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-[color:var(--border-light)] bg-card/95 backdrop-blur md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-[color:var(--border-light)] px-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--text-primary)] text-base font-black text-white shadow-[0_6px_16px_-6px_rgba(26,26,30,0.4)]">
            M
          </span>
          <div className="flex-1 leading-tight">
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">MBD Clinic OS</p>
            <p className="text-xs text-[color:var(--text-tertiary)]">
              {activeSlug?.name ?? "Movement By Design"}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {(Object.keys(grouped) as Array<keyof typeof grouped>).map((section) => {
            const sectionItems = grouped[section];
            if (sectionItems.length === 0) return null;
            return (
              <div key={section} className="space-y-1.5">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-tertiary)]">
                  {SECTION_LABELS[section]}
                </p>
                <ul className="space-y-0.5">
                  {sectionItems.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon as NavIconKey | undefined}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <Separator />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-[color:var(--text-primary)]">
            {initials(session.user.name ?? "??")}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {session.user.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[color:var(--text-secondary)]">
              <Badge variant="outline">{role}</Badge>
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              // AUTH-007: bump sessionVersion before clearing the cookie so
              // any other device still holding the JWT is rejected by
              // api-auth.ts:verifySessionVersion on its next request. A
              // logout that doesn't revoke the token is a logout in name
              // only. DB failure must not block sign-out.
              const sess = await auth();
              if (sess?.user?.id) {
                try {
                  await prisma.staff.update({
                    where: { id: sess.user.id },
                    data: { sessionVersion: { increment: 1 } },
                  });
                } catch {
                  // swallow — sign-out proceeds either way
                }
              }
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-[color:var(--border-light)] bg-card/80 px-4 backdrop-blur md:px-6">
          <div className="md:hidden">
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">MBD Clinic OS</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SearchTrigger />
            {userCanSwitch ? (
              <CentreSwitcher
                centres={centres}
                activeCentreId={activeCentre}
                defaultCentreId={session.user.centreId}
              />
            ) : null}
            <NotificationBell />
          </div>
        </header>
        <div className="px-6 py-6 lg:px-10 lg:py-8">{children}</div>
      </main>

      <CommandPalette role={role} />
    </div>
  );
}
