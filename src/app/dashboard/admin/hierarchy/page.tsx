import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Role } from "@/lib/permissions";
import { activeCentreId } from "@/lib/centre";
import { GitBranch, Crown, ShieldCheck, Briefcase, ArrowRight, Building2, Stethoscope } from "lucide-react";
import { DraggableTree } from "./draggable-tree";
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
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-12">
      <header className="space-y-1">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          <GitBranch className="h-7 w-7 text-primary" /> Hierarchy
        </h1>
        <p className="max-w-2xl text-sm text-[color:var(--text-tertiary)]">
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
              tint: "text-purple-700 border-purple-300 bg-purple-50",
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
              tint: "text-sky-700 border-sky-300 bg-sky-50",
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
                tint: "text-emerald-700 border-emerald-300 bg-emerald-50",
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
  header: { icon: React.ReactNode; label: string; tint: string; addButton: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm ${header.tint}`}>
        {header.icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{header.label}</span>
      </div>
      {header.addButton}
      <div className="mt-1 flex flex-col items-center gap-2">{children}</div>
    </div>
  );
}
