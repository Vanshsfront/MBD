import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  hasPermission,
  type Role,
  PERMISSIONS,
  ROLES,
  permissionsFor,
  type Permission,
} from "@/lib/permissions";
import { ensurePermissionsCacheFresh } from "@/lib/permissions-cache";
import { activeCentreId } from "@/lib/centre";
import { GitBranch, Crown, ShieldCheck, Briefcase, ArrowRight, Building2, Stethoscope } from "lucide-react";
import { DraggableTree } from "./draggable-tree";
import { PermissionsMatrix } from "./permissions-matrix";
import {
  StaffCard,
  AddStaffButton,
  EmptySlot,
  CARD_WIDTH,
  CARD_HEIGHT_HEADLINE,
  type StaffLite,
  type DepartmentLite,
} from "./hierarchy-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hierarchy — MBD Clinic OS" };

/**
 * Org-chart view of the active clinic and a secondary CRUD surface for staff:
 *   - click a card → edit role / department / designation / active / password / remove
 *   - "+" in any column header (or an empty slot) → add staff pre-scoped to that branch
 */
export default async function HierarchyPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role as Role, "admin:manage_staff")) redirect("/dashboard");

  const centreId = await activeCentreId();
  const [activeCentre, departments, staffRaw] = await Promise.all([
    centreId
      ? prisma.centre.findUnique({
          where: { id: centreId },
          select: { id: true, name: true, slug: true, location: true },
        })
      : Promise.resolve(null),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: centreId ? { OR: [{ centreId }, { role: "OWNER" }, { role: "DEV" }] } : {},
      include: { department: { select: { id: true, name: true } } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  const staff: StaffLite[] = staffRaw.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    designation: s.designation,
    isActive: s.isActive,
    departmentId: s.departmentId,
    department: s.department,
  }));
  const depts: DepartmentLite[] = departments;

  const owner = staff.find((s) => s.role === "OWNER");
  const admins = staff.filter((s) => s.role === "ADMIN");
  const fo = staff.filter((s) => s.role === "FRONT_OFFICE");

  // Permissions matrix — only OWNER + DEV can edit. Load current overrides
  // so the matrix renders the live state. ensurePermissionsCacheFresh()
  // primes the same in-memory cache that hasPermission() reads.
  const canEditPermissions =
    session.user.role === "OWNER" || session.user.role === "DEV";
  let permissionOverrideRows: Array<{ role: string; permission: string; granted: boolean }> = [];
  if (canEditPermissions) {
    await ensurePermissionsCacheFresh();
    permissionOverrideRows = await prisma.rolePermission.findMany({
      select: { role: true, permission: true, granted: true },
    });
  }
  const overridesMatrix: Record<Role, Record<string, boolean>> = {
    OWNER: {},
    ADMIN: {},
    FRONT_OFFICE: {},
    CONSULTANT: {},
    THERAPIST: {},
    DEV: {},
  };
  for (const r of permissionOverrideRows) {
    if (!(ROLES as readonly string[]).includes(r.role)) continue;
    overridesMatrix[r.role as Role][r.permission] = r.granted;
  }
  const defaultsMatrix: Record<Role, ReadonlyArray<string>> = {
    OWNER: permissionsFor("OWNER") as readonly string[],
    ADMIN: permissionsFor("ADMIN") as readonly string[],
    FRONT_OFFICE: permissionsFor("FRONT_OFFICE") as readonly string[],
    CONSULTANT: permissionsFor("CONSULTANT") as readonly string[],
    THERAPIST: permissionsFor("THERAPIST") as readonly string[],
    DEV: permissionsFor("DEV") as readonly string[],
  };
  // Group permissions by prefix for the matrix UI (Patients, Appointments,
  // Billing, etc.) — derived once from the permission strings themselves.
  const PERMISSION_GROUPS: Record<string, string[]> = {};
  for (const p of PERMISSIONS as readonly Permission[]) {
    const group = p.split(":")[0] ?? "other";
    const label = group.charAt(0).toUpperCase() + group.slice(1);
    (PERMISSION_GROUPS[label] ??= []).push(p);
  }

  // Anyone in a clinical department is listed under it (an ADMIN who is also a
  // physiotherapist appears in both Administrators and Physiotherapy).
  const clinicalMembership = staff.filter(
    (s) => s.role !== "OWNER" && s.role !== "FRONT_OFFICE" && s.role !== "DEV",
  );
  const byDept = new Map<string, { id: string | null; members: StaffLite[] }>();
  for (const d of depts) byDept.set(d.name, { id: d.id, members: [] });
  for (const s of clinicalMembership) {
    const key = s.department?.name ?? "Unassigned";
    if (!byDept.has(key)) byDept.set(key, { id: null, members: [] });
    byDept.get(key)!.members.push(s);
  }
  const deptEntries = Array.from(byDept.entries()).sort(([a], [b]) => a.localeCompare(b));

  if (!activeCentre) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-16 text-center">
        <GitBranch className="mx-auto h-10 w-10 text-[color:var(--text-tertiary)]" />
        <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">No active clinic selected</h1>
        <p className="text-sm text-[color:var(--text-tertiary)]">Pick a clinic from the header switcher, or create one first.</p>
        <Link href="/dashboard/admin/clinics" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          Manage clinics <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="space-y-1">
        <p className="eyebrow">Admin</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <GitBranch className="h-6 w-6 text-[color:var(--primary)]" /> Hierarchy
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Click any card to edit a person, or use <strong>+</strong> in a column header to add staff into that branch.
          Admins with a clinical department appear in both places.
        </p>
      </header>

      <DraggableTree>
        {owner && (
          <div className="flex flex-col items-center">
            <div className="relative z-10">
              <StaffCard staff={owner} departments={depts} icon={<Crown className="h-4 w-4" />} prominent />
            </div>
            <div className="h-8 w-px border-l-2 border-dotted border-[color:var(--text-tertiary)]/40" />
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center">
          <div className={`neumorphic-card ${CARD_WIDTH} ${CARD_HEIGHT_HEADLINE} flex items-center gap-2 px-3 py-2`}>
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Clinic</p>
              <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{activeCentre.name}</p>
              <p className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{activeCentre.slug}</p>
            </div>
          </div>
        </div>

        <div className="h-8 w-px border-l-2 border-dotted border-[color:var(--text-tertiary)]/40" />

        <BranchesRow>
          <BranchColumn
            header={{
              icon: <ShieldCheck className="h-3.5 w-3.5" />,
              label: "Administrators",
              accent: "var(--chart-1)",
              addButton: <AddStaffButton departments={depts} defaultRole="ADMIN" label="admin" />,
            }}
          >
            {admins.length === 0 ? (
              <EmptySlot departments={depts} defaultRole="ADMIN" hint="Add admin" />
            ) : (
              admins.map((a) => <StaffCard key={a.id} staff={a} departments={depts} icon={<ShieldCheck className="h-4 w-4" />} />)
            )}
          </BranchColumn>

          <BranchColumn
            header={{
              icon: <Briefcase className="h-3.5 w-3.5" />,
              label: "Front Office",
              accent: "var(--chart-2)",
              addButton: <AddStaffButton departments={depts} defaultRole="FRONT_OFFICE" label="FO" />,
            }}
          >
            {fo.length === 0 ? (
              <EmptySlot departments={depts} defaultRole="FRONT_OFFICE" hint="Add front office" />
            ) : (
              fo.map((f) => <StaffCard key={f.id} staff={f} departments={depts} icon={<Briefcase className="h-4 w-4" />} />)
            )}
          </BranchColumn>

          {deptEntries.map(([deptName, bucket]) => (
            <BranchColumn
              key={deptName}
              header={{
                icon: <Stethoscope className="h-3.5 w-3.5" />,
                label: deptName,
                accent: "var(--chart-3)",
                addButton: (
                  <AddStaffButton departments={depts} defaultRole="THERAPIST" defaultDepartmentId={bucket.id} label="staff" />
                ),
              }}
            >
              {bucket.members.length === 0 ? (
                <EmptySlot departments={depts} defaultRole="THERAPIST" defaultDepartmentId={bucket.id} hint={`Add to ${deptName}`} />
              ) : (
                bucket.members.map((m) => <StaffCard key={m.id} staff={m} departments={depts} icon={<Stethoscope className="h-4 w-4" />} />)
              )}
            </BranchColumn>
          ))}
        </BranchesRow>
      </DraggableTree>

      {canEditPermissions ? (
        <PermissionsMatrix
          roles={ROLES}
          permissions={PERMISSIONS}
          groups={PERMISSION_GROUPS}
          defaults={defaultsMatrix}
          overrides={overridesMatrix}
        />
      ) : null}
    </div>
  );
}

function BranchesRow({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <div className="relative flex w-full items-start justify-center">
      {items.map((child, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === items.length - 1;
        const isOnly = items.length === 1;
        return (
          <div key={idx} className="relative flex flex-shrink-0 flex-col items-center px-3">
            {!isOnly && (
              <div
                className={`absolute top-0 border-t-2 border-dotted border-[color:var(--text-tertiary)]/40 ${
                  isFirst ? "left-1/2 right-0" : isLast ? "left-0 right-1/2" : "left-0 right-0"
                }`}
              />
            )}
            <div className="h-6 w-px border-l-2 border-dotted border-[color:var(--text-tertiary)]/40" />
            {child}
          </div>
        );
      })}
    </div>
  );
}

function BranchColumn({
  header,
  children,
}: {
  header: { icon: React.ReactNode; label: string; accent: string; addButton: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 ring-1 ring-[color:var(--border-light)] shadow-[0_1px_2px_0_var(--shadow-color)]"
        style={{ color: header.accent }}
      >
        {header.icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]">{header.label}</span>
      </div>
      {header.addButton}
      <div className="mt-1 flex flex-col items-center gap-2">{children}</div>
    </div>
  );
}
