import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { getActiveCentreId } from "@/lib/active-centre";
import { GitBranch, Crown, ShieldCheck, Briefcase, ArrowRight, Building2, Stethoscope } from "lucide-react";
import { DraggableTree } from "./draggable-tree";
import {
  StaffCard,
  AddStaffButton,
  EmptySlot,
  AddDepartmentButton,
  CARD_WIDTH,
  CARD_HEIGHT_HEADLINE,
  type StaffLite,
  type DepartmentLite,
} from "./hierarchy-client";

export const dynamic = "force-dynamic";

/**
 * Hierarchy is the primary CRUD surface for staff:
 *   - click a card → edit role / dept / designation / active / remove
 *   - "+" in any column header → add a staff member pre-scoped to that branch
 *   - empty slots under a department invite adds for that dept
 */
export default async function HierarchyPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  if (!hasPermission(role, "admin:staff") && !hasPermission(role, "admin:clinics")) {
    redirect("/dashboard");
  }

  const activeCentreId = await getActiveCentreId();
  const [activeCentre, departments, staffRaw] = await Promise.all([
    activeCentreId
      ? prisma.centre.findUnique({
          where: { id: activeCentreId },
          select: { id: true, name: true, slug: true, location: true },
        })
      : Promise.resolve(null),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: activeCentreId ? { OR: [{ centreId: activeCentreId }, { role: "OWNER" }, { role: "DEV" }] } : {},
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

  // Anyone who belongs to a clinical department gets listed there too — so
  // Yasir (ADMIN + Senior Physiotherapist) shows up in both "Administrators"
  // and "Physiotherapy". OWNER / FRONT_OFFICE never appear in department
  // buckets; everyone else does.
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
      <div className="max-w-3xl mx-auto py-16 text-center space-y-3">
        <GitBranch className="h-10 w-10 text-text-tertiary mx-auto" />
        <h1 className="text-xl font-semibold text-text-primary">No active clinic selected</h1>
        <p className="text-sm text-text-tertiary">Pick a clinic from the switcher in the header, or create one first.</p>
        <Link href="/dashboard/admin/clinics" className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold">
          Manage clinics <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-indigo-600" /> Hierarchy
          </h1>
          <p className="text-sm text-text-tertiary max-w-2xl">
            Click any card to edit role, department or remove that person. Use <strong>+</strong> in each column header to add new staff into that branch. Admins with a clinical department appear in both places.
          </p>
        </div>
        <AddDepartmentButton />
      </div>

      <DraggableTree>
        {/* Owner */}
        {owner && (
          <div className="flex flex-col items-center">
            <div className="relative z-10">
              <StaffCard staff={owner} departments={depts} icon={<Crown className="h-4 w-4" />} prominent />
            </div>
            <div className="h-8 w-px border-l-2 border-dotted border-text-tertiary/40" />
          </div>
        )}

        {/* Clinic */}
        <div className="flex flex-col items-center z-10 relative">
          <div className={`neumorphic-card ${CARD_WIDTH} ${CARD_HEIGHT_HEADLINE} px-3 py-2 flex items-center gap-2 border border-indigo-300 bg-indigo-50/50 shadow-sm`}>
            <Building2 className="h-5 w-5 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-700">Clinic</p>
              <p className="text-sm font-semibold text-text-primary truncate">{activeCentre.name}</p>
              <p className="text-[10px] text-text-tertiary font-mono">{activeCentre.slug}</p>
            </div>
          </div>
        </div>

        {/* Fan-out down */}
        <div className="h-8 w-px border-l-2 border-dotted border-text-tertiary/40" />

        {/* Branches row */}
        <BranchesRow>
          {/* Admins */}
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
            ) : admins.map((a) => (
              <StaffCard key={a.id} staff={a} departments={depts} icon={<ShieldCheck className="h-4 w-4" />} />
            ))}
          </BranchColumn>

          {/* Front Office */}
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
            ) : fo.map((f) => (
              <StaffCard key={f.id} staff={f} departments={depts} icon={<Briefcase className="h-4 w-4" />} />
            ))}
          </BranchColumn>

          {/* One column per department */}
          {deptEntries.map(([deptName, bucket]) => (
            <BranchColumn
              key={deptName}
              header={{
                icon: <Stethoscope className="h-3.5 w-3.5" />,
                label: deptName,
                tint: "text-emerald-700 border-emerald-300 bg-emerald-50",
                addButton: (
                  <AddStaffButton
                    departments={depts}
                    defaultRole="THERAPIST"
                    defaultDepartmentId={bucket.id}
                    label="staff"
                  />
                ),
              }}
            >
              {bucket.members.length === 0 ? (
                <EmptySlot
                  departments={depts}
                  defaultRole="THERAPIST"
                  defaultDepartmentId={bucket.id}
                  hint={`Add to ${deptName}`}
                />
              ) : bucket.members.map((m) => (
                <StaffCard key={m.id} staff={m} departments={depts} icon={<Stethoscope className="h-4 w-4" />} />
              ))}
            </BranchColumn>
          ))}
        </BranchesRow>
      </DraggableTree>
    </div>
  );
}

// ── Layout helpers (server-rendered, visual only) ──────────────────────────

function BranchesRow({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <div className="flex justify-center items-start w-full relative">
      {items.map((child, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === items.length - 1;
        const isOnly = items.length === 1;
        return (
          <div key={idx} className="flex flex-col items-center relative px-3 flex-shrink-0">
            {!isOnly && (
              <div
                className={`absolute top-0 border-t-2 border-dotted border-text-tertiary/40 ${
                  isFirst ? "left-1/2 right-0" : isLast ? "left-0 right-1/2" : "left-0 right-0"
                }`}
              />
            )}
            <div className="h-6 border-l-2 border-dotted border-text-tertiary/40 w-px" />
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
      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm ${header.tint}`}>
        {header.icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{header.label}</span>
      </div>
      {header.addButton}
      <div className="flex flex-col items-center gap-2 mt-1">
        {children}
      </div>
    </div>
  );
}
