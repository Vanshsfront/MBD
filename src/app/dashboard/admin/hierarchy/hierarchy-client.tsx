"use client";

// Interactive cards for the Hierarchy org-chart. The server page fetches staff
// + departments; cards open the shared Add/Edit dialogs and router.refresh() on
// change. Ported from Clinic 2, adapted to OG endpoints + design tokens.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import {
  AddStaffDialog,
  EditStaffDialog,
  type StaffLite,
  type DepartmentLite,
} from "@/components/admin/staff-dialogs";

export type { StaffLite, DepartmentLite };

const ROLE_TINT: Record<string, string> = {
  OWNER: "bg-amber-50 text-amber-700",
  ADMIN: "bg-purple-50 text-purple-700",
  CONSULTANT: "bg-blue-50 text-blue-700",
  THERAPIST: "bg-emerald-50 text-emerald-700",
  FRONT_OFFICE: "bg-sky-50 text-sky-700",
  DEV: "bg-slate-100 text-slate-700",
};

export const CARD_WIDTH = "w-[210px]";
export const CARD_HEIGHT_STAFF = "min-h-[64px]";
export const CARD_HEIGHT_HEADLINE = "min-h-[76px]";

export function StaffCard({
  staff,
  departments,
  icon,
  prominent = false,
}: {
  staff: StaffLite;
  departments: DepartmentLite[];
  icon?: React.ReactNode;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`neumorphic-card ${CARD_WIDTH} ${prominent ? CARD_HEIGHT_HEADLINE : CARD_HEIGHT_STAFF} group flex cursor-pointer items-center gap-2 px-3 py-2 text-left transition-all hover-lift ${staff.isActive ? "" : "opacity-60"}`}
      >
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ROLE_TINT[staff.role] ?? ROLE_TINT.THERAPIST}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[color:var(--text-primary)]">{staff.name}</p>
          <p className="truncate text-[10px] text-[color:var(--text-tertiary)]">
            {staff.designation ?? staff.department?.name ?? staff.role}
            {!staff.isActive ? " · inactive" : ""}
          </p>
        </div>
        <Pencil className="h-3 w-3 shrink-0 text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100" />
      </button>
      {open && (
        <EditStaffDialog
          staff={staff}
          departments={departments}
          onClose={() => setOpen(false)}
          onChanged={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export function AddStaffButton({
  departments,
  defaultRole,
  defaultDepartmentId,
  label = "Add",
}: {
  departments: DepartmentLite[];
  defaultRole?: string;
  defaultDepartmentId?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[color:var(--border)] bg-card/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary hover:border-primary"
        title={`Add ${label}`}
      >
        <Plus className="h-3 w-3" /> {label}
      </button>
      {open && (
        <AddStaffDialog
          departments={departments}
          defaultRole={defaultRole}
          defaultDepartmentId={defaultDepartmentId ?? undefined}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export function EmptySlot({
  departments,
  defaultRole,
  defaultDepartmentId,
  hint,
}: {
  departments: DepartmentLite[];
  defaultRole?: string;
  defaultDepartmentId?: string | null;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${CARD_WIDTH} ${CARD_HEIGHT_STAFF} flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[color:var(--border)] text-[11px] font-semibold text-[color:var(--text-tertiary)] transition-all hover:border-primary hover:text-primary`}
      >
        <Plus className="h-3.5 w-3.5" /> {hint}
      </button>
      {open && (
        <AddStaffDialog
          departments={departments}
          defaultRole={defaultRole}
          defaultDepartmentId={defaultDepartmentId ?? undefined}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
