// Phase 9 — role × route acceptance smoke. Replaces the manual "click every
// page as every role" pass at the architectural level: the nav whitelist
// (`src/lib/nav.ts`) advertises a route to a role iff `canAccessRoute()`
// returns true for that role. So the contract is:
//
//   for each NAV_ITEM × each ROLE:
//     navItemsFor(role).includes(item)  ⇔  canAccessRoute(role, item.href)
//
// Plus: every route advertised in nav must have a matching `page.tsx` under
// `src/app/<href>/page.tsx` (catches a future `<Link>` to a deleted route).
//
// PRD §4 acceptance criteria are role-coupled — Marazban (OWNER) sees
// everything, Devanshi (THERAPIST) sees only their patients, etc. — so we
// also assert each PRD §4 journey's locked role × permission tuples via
// `hasPermission()`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { NAV_ITEMS, navItemsFor, canAccessRoute } from "../src/lib/nav";
import { ROLES, hasPermission, type Role } from "../src/lib/permissions";

interface JourneyAssertion {
  journey: string;
  role: Role;
  permission: Parameters<typeof hasPermission>[1];
  expected: boolean;
}

// PRD §4 — locked role × permission contract per journey.
const JOURNEY_CONTRACT: JourneyAssertion[] = [
  // Journey A — Walk-in intake
  { journey: "A2 FO generates QR", role: "FRONT_OFFICE", permission: "patients:generate_intake_qr", expected: true },
  { journey: "A2 OWNER generates QR", role: "OWNER", permission: "patients:generate_intake_qr", expected: true },
  { journey: "A2 THERAPIST cannot generate QR", role: "THERAPIST", permission: "patients:generate_intake_qr", expected: false },
  { journey: "A4 FO assigns therapist", role: "FRONT_OFFICE", permission: "patients:assign_therapist", expected: true },
  { journey: "A4 ADMIN cannot assign therapist", role: "ADMIN", permission: "patients:assign_therapist", expected: false },
  { journey: "A6 FO books appointment", role: "FRONT_OFFICE", permission: "appointments:book_reschedule_cancel", expected: true },

  // Journey B — Returning consultation → invoice → payment
  { journey: "B4 THERAPIST edits own clinical record", role: "THERAPIST", permission: "patients:edit_clinical_record_own", expected: true },
  { journey: "B4 CONSULTANT edits own clinical record", role: "CONSULTANT", permission: "patients:edit_clinical_record_own", expected: true },
  { journey: "B4 FO cannot edit clinical record", role: "FRONT_OFFICE", permission: "patients:edit_clinical_record_own", expected: false },
  { journey: "B4 OWNER override on completed records", role: "OWNER", permission: "patients:edit_completed_clinical_record", expected: true },
  { journey: "B4 ADMIN no override", role: "ADMIN", permission: "patients:edit_completed_clinical_record", expected: false },
  { journey: "B6 FO creates invoice", role: "FRONT_OFFICE", permission: "billing:create_edit_invoice", expected: true },
  { journey: "B6 ADMIN cannot create invoice", role: "ADMIN", permission: "billing:create_edit_invoice", expected: false },
  { journey: "B7 FO records payment", role: "FRONT_OFFICE", permission: "billing:record_payment", expected: true },

  // Journey C — Therapist daily
  { journey: "C2 THERAPIST raises change request", role: "THERAPIST", permission: "appointments:request_change", expected: true },
  { journey: "C2 FO does NOT raise change request", role: "FRONT_OFFICE", permission: "appointments:request_change", expected: false },

  // Journey D — FO daily
  { journey: "D10 FO reviews change request", role: "FRONT_OFFICE", permission: "appointments:review_change_request", expected: true },
  { journey: "D10 OWNER also reviews", role: "OWNER", permission: "appointments:review_change_request", expected: true },
  { journey: "D10 THERAPIST does NOT review", role: "THERAPIST", permission: "appointments:review_change_request", expected: false },

  // Journey E — Owner / Admin overview & MIS
  { journey: "E2 OWNER MIS dashboard", role: "OWNER", permission: "reports:mis", expected: true },
  { journey: "E2 ADMIN MIS dashboard", role: "ADMIN", permission: "reports:mis", expected: true },
  { journey: "E2 FO no MIS", role: "FRONT_OFFICE", permission: "reports:mis", expected: false },
  { journey: "E2 OWNER CSV export", role: "OWNER", permission: "reports:export_csv", expected: true },
  { journey: "E2 ADMIN no CSV export", role: "ADMIN", permission: "reports:export_csv", expected: false },
  { journey: "E6 OWNER manages clinics", role: "OWNER", permission: "admin:manage_clinics", expected: true },
  { journey: "E6 ADMIN does not manage clinics", role: "ADMIN", permission: "admin:manage_clinics", expected: false },
  { journey: "E7 OWNER audit log", role: "OWNER", permission: "admin:audit_log", expected: true },
  { journey: "E7 ADMIN audit log", role: "ADMIN", permission: "admin:audit_log", expected: true },
];

// Routes that the nav lists but live under a slug-parent we serve. Map each
// nav href to the actual file path that satisfies it.
function pageFileForHref(href: string): string {
  // /dashboard → src/app/dashboard/page.tsx
  // /dashboard/admin/clinics → src/app/dashboard/admin/clinics/page.tsx
  return path.join(process.cwd(), "src/app", href, "page.tsx");
}

async function checkNavMatchesPermissionMatrix(): Promise<void> {
  let issues = 0;
  for (const item of NAV_ITEMS) {
    for (const role of ROLES) {
      const visibleViaNav = navItemsFor(role).some((i) => i.href === item.href);
      const accessibleViaRoute = canAccessRoute(role, item.href);
      if (visibleViaNav !== accessibleViaRoute) {
        issues++;
        console.error(
          `  drift: ${role} × ${item.href} — nav=${visibleViaNav} canAccessRoute=${accessibleViaRoute}`,
        );
      }
    }
  }
  if (issues > 0) throw new Error(`${issues} role × route mismatches`);
  console.log(
    `[smoke-acceptance] nav ⇔ canAccessRoute aligned across ${NAV_ITEMS.length} routes × ${ROLES.length} roles ✅`,
  );
}

async function checkEveryNavHrefHasPage(): Promise<void> {
  const missing: string[] = [];
  for (const item of NAV_ITEMS) {
    const file = pageFileForHref(item.href);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) missing.push(item.href);
    } catch {
      missing.push(item.href);
    }
  }
  if (missing.length > 0) {
    throw new Error(`nav advertises ${missing.length} routes with no page.tsx: ${missing.join(", ")}`);
  }
  console.log(`[smoke-acceptance] all ${NAV_ITEMS.length} nav routes have a page.tsx ✅`);
}

function checkJourneyContract(): void {
  let issues = 0;
  for (const a of JOURNEY_CONTRACT) {
    const actual = hasPermission(a.role, a.permission);
    if (actual !== a.expected) {
      issues++;
      console.error(
        `  drift: ${a.journey} — expected ${a.expected} got ${actual}`,
      );
    }
  }
  if (issues > 0) throw new Error(`${issues} PRD §4 journey contract violations`);
  console.log(
    `[smoke-acceptance] PRD §4 journey contract holds across ${JOURNEY_CONTRACT.length} role×permission tuples ✅`,
  );
}

async function main(): Promise<void> {
  await checkNavMatchesPermissionMatrix();
  await checkEveryNavHrefHasPage();
  checkJourneyContract();
  console.log("[smoke-acceptance] PASS ✅");
}

main().catch((err) => {
  console.error("[smoke-acceptance] FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
