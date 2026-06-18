"use client";

// Per-role permission editor. Renders accordion with one section per role;
// each section is a checkbox grid for the 58 permissions. Toggling sends
// POST /api/admin/role-permissions (upsert override); "Revert to default"
// sends DELETE (remove override).
//
// State model:
//   - `defaults[role]` = the hard-coded set from permissions.ts
//   - `overrides[role][permission]` = boolean if an override exists, undefined otherwise
//   - effective = override ?? default
//
// Surfaces three states per checkbox: granted (default), revoked (override),
// and "differs from default" badge so the editor can see at-a-glance which
// rules they've customised.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/error-messages";

type Role = "OWNER" | "ADMIN" | "FRONT_OFFICE" | "CONSULTANT" | "THERAPIST" | "DEV";

interface Props {
  roles: ReadonlyArray<Role>;
  // All permission strings in display order.
  permissions: ReadonlyArray<string>;
  // Grouped for the UI — { "Patients": ["patients:view_all", ...] }
  groups: Record<string, ReadonlyArray<string>>;
  // Defaults from permissions.ts — used to determine what "revert" means.
  defaults: Record<Role, ReadonlyArray<string>>;
  // Current override rows — { role: { permission: granted } }.
  overrides: Record<Role, Record<string, boolean>>;
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  FRONT_OFFICE: "Front Office",
  CONSULTANT: "Consultant",
  THERAPIST: "Therapist",
  DEV: "Dev",
};

export function PermissionsMatrix({
  roles,
  groups,
  defaults,
  overrides: initialOverrides,
}: Props) {
  const [overrides, setOverrides] =
    useState<Record<Role, Record<string, boolean>>>(initialOverrides);
  const [openRole, setOpenRole] = useState<Role | null>(null);
  const [pending, startTransition] = useTransition();

  function effective(role: Role, perm: string): boolean {
    const override = overrides[role]?.[perm];
    if (override !== undefined) return override;
    return defaults[role].includes(perm);
  }

  function isOverridden(role: Role, perm: string): boolean {
    return overrides[role]?.[perm] !== undefined;
  }

  async function toggle(role: Role, perm: string, nextGranted: boolean) {
    const previous = overrides;
    // Optimistic update.
    setOverrides({
      ...previous,
      [role]: { ...(previous[role] ?? {}), [perm]: nextGranted },
    });
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/role-permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, permission: perm, granted: nextGranted }),
        });
        if (!res.ok) {
          throw new Error(await readApiError(res, { fallback: "Couldn't save permission." }));
        }
      } catch (err) {
        setOverrides(previous);
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  async function revert(role: Role, perm: string) {
    const previous = overrides;
    const next = { ...previous, [role]: { ...(previous[role] ?? {}) } };
    delete next[role][perm];
    setOverrides(next);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ role, permission: perm });
        const res = await fetch(`/api/admin/role-permissions?${params}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(await readApiError(res, { fallback: "Couldn't revert to default." }));
        }
      } catch (err) {
        setOverrides(previous);
        toast.error(err instanceof Error ? err.message : "Revert failed");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-card/70 p-5 ring-1 ring-[color:var(--border-light)] shadow-[0_1px_2px_0_var(--shadow-color)]">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Permissions</p>
          <h2 className="text-lg font-semibold tracking-tight">Role permissions matrix</h2>
          <p className="text-xs text-muted-foreground">
            Toggle to override the hard-coded defaults. Changes apply immediately on the next API call.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        {roles.map((role) => {
          const isOpen = openRole === role;
          const overrideCount = Object.keys(overrides[role] ?? {}).length;
          return (
            <div
              key={role}
              className="overflow-hidden rounded-lg border border-[color:var(--border-light)]"
            >
              <button
                type="button"
                onClick={() => setOpenRole(isOpen ? null : role)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-3">
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                  <span className="font-semibold">{ROLE_LABEL[role]}</span>
                  <span className="text-xs text-muted-foreground">
                    {defaults[role].length} default
                    {overrideCount > 0 ? (
                      <span className="ml-1 text-amber-700">· {overrideCount} override{overrideCount === 1 ? "" : "s"}</span>
                    ) : null}
                  </span>
                </span>
                {pending ? <span className="text-[10px] text-muted-foreground">Saving…</span> : null}
              </button>
              {isOpen ? (
                <div className="space-y-4 border-t border-[color:var(--border-light)] bg-secondary/30 p-4">
                  {Object.entries(groups).map(([groupLabel, perms]) => (
                    <div key={groupLabel} className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {groupLabel}
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {perms.map((p) => {
                          const granted = effective(role, p);
                          const overridden = isOverridden(role, p);
                          return (
                            <label
                              key={p}
                              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                                overridden ? "border-amber-300 bg-amber-50" : "border-[color:var(--border-light)] bg-card"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={granted}
                                onChange={(e) => toggle(role, p, e.target.checked)}
                                disabled={pending}
                              />
                              <span className="flex-1 font-mono text-[11px]">{p}</span>
                              {overridden ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    revert(role, p);
                                  }}
                                  disabled={pending}
                                  className="text-amber-700 hover:text-amber-900"
                                  aria-label="Revert to default"
                                  title="Revert to default"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </button>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
