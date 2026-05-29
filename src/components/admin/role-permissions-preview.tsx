"use client";

// Read-only preview of what permissions a given role carries. Shown next to
// the role picker in AddStaffDialog so the admin knows what they're handing
// out before they click "Add staff".
//
// Permissions are role-based today (PRD §3.1), not per-staff overrides, so
// this is intentionally non-editable. If we ever add per-staff overrides
// (custom grants/revokes on top of the role baseline), this is the right
// surface to extend.

import { useMemo, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { permissionsFor, type Role, type Permission } from "@/lib/permissions";

// Permission groups + human labels. Keep tight — one line each, no jargon
// the admin would have to look up. Grouped so the FO-facing role doesn't
// drown in admin-only flags.
const PERMISSION_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ key: Permission; label: string }>;
}> = [
  {
    label: "Patients",
    items: [
      { key: "patients:generate_intake_qr", label: "Generate intake QR / link" },
      { key: "patients:view_all", label: "View all patients" },
      { key: "patients:view_assigned", label: "View patients assigned to them" },
      { key: "patients:edit_demographics", label: "Edit demographics" },
      { key: "patients:assign_therapist", label: "Assign therapists" },
      { key: "patients:edit_clinical_record_own", label: "Edit own clinical records" },
      { key: "patients:view_all_clinical_records", label: "View all clinical records" },
      { key: "patients:edit_completed_clinical_record", label: "Edit COMPLETED records (Owner only)" },
    ],
  },
  {
    label: "Appointments",
    items: [
      { key: "appointments:view_calendar_all", label: "View the full calendar" },
      { key: "appointments:book_reschedule_cancel", label: "Book / reschedule / cancel" },
      { key: "appointments:request_change", label: "Raise change requests" },
      { key: "appointments:review_change_request", label: "Review change requests" },
    ],
  },
  {
    label: "Billing",
    items: [
      { key: "billing:view_invoices", label: "View invoices" },
      { key: "billing:create_edit_invoice", label: "Create / edit invoices" },
      { key: "billing:view_payments", label: "View payments" },
      { key: "billing:record_payment", label: "Record payments" },
      { key: "billing:view_packages", label: "View packages" },
      { key: "billing:edit_packages", label: "Create / edit packages" },
    ],
  },
  {
    label: "Reports",
    items: [
      { key: "reports:view", label: "View reports" },
      { key: "reports:mis", label: "MIS dashboard" },
      { key: "reports:export_csv", label: "Export CSV" },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "admin:manage_staff", label: "Manage staff" },
      { key: "admin:manage_clinics", label: "Manage clinics" },
      { key: "admin:manage_services", label: "Manage services + rates" },
      { key: "admin:manage_products", label: "Manage inventory" },
      { key: "admin:manage_promotions", label: "Manage promotions" },
      { key: "admin:manage_referral_sources", label: "Manage referral sources" },
      { key: "admin:audit_log", label: "Audit log" },
      { key: "admin:client_flags", label: "Client flags" },
      { key: "admin:attendance", label: "Attendance" },
    ],
  },
];

export function RolePermissionsPreview({ role }: { role: Role }) {
  const granted = useMemo(() => new Set(permissionsFor(role)), [role]);
  const [open, setOpen] = useState(false);

  const grantedCount = granted.size;
  const totalCount = PERMISSION_GROUPS.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="rounded-lg border border-[color:var(--border-light)] bg-secondary/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
        <span className="flex-1 font-semibold">
          What this role can do · {grantedCount} of {totalCount} permissions
        </span>
      </button>
      {open ? (
        <div className="space-y-3 px-3 pb-3">
          {PERMISSION_GROUPS.map((group) => {
            const groupGranted = group.items.filter((i) => granted.has(i.key)).length;
            if (groupGranted === 0) return null;
            return (
              <div key={group.label}>
                <p className="eyebrow !mb-1.5">{group.label}</p>
                <ul className="space-y-0.5 text-xs">
                  {group.items.map((item) => {
                    const has = granted.has(item.key);
                    return (
                      <li key={item.key} className="flex items-start gap-2">
                        {has ? (
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#15683b]" aria-hidden />
                        ) : (
                          <X className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--text-tertiary)]" aria-hidden />
                        )}
                        <span className={has ? "" : "text-[color:var(--text-tertiary)] line-through"}>
                          {item.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="border-t border-[color:var(--border-light)] pt-2 text-[10.5px] text-[color:var(--text-tertiary)]">
            Permissions are role-based (PRD §3.1). To change what a staff member can do, change
            their role. Per-staff overrides aren&apos;t supported yet.
          </p>
        </div>
      ) : null}
    </div>
  );
}
