"use client";

// Sub-tabs for the patient-detail surface. Client component so the active-pill
// follows client-side navigation between sub-routes — same pattern as the
// sidebar's `NavLink`, since App Router caches parent layouts across in-app
// navigation and a server-rendered pathname prop would go stale.

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PatientSubTab = {
  href: string;
  label: string;
};

export function PatientSubTabs({ tabs }: { tabs: ReadonlyArray<PatientSubTab> }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Patient sections">
      {tabs.map((t) => {
        // Overview is the bare base path (no suffix) — match exact only;
        // sub-tabs match prefix so /clinical/[rid] also activates Clinical.
        const isOverview = !t.href.match(/\/(clinical|packages|invoices|flags|activity)(\/|$)/);
        const isActive = isOverview
          ? pathname === t.href
          : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive ? "true" : undefined}
            className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-[color:var(--text-primary)] data-[active=true]:text-foreground"
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
