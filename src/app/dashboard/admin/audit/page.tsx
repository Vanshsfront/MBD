import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Audit log — MBD Clinic OS" };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; user?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:audit_log")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const from = sp.from ? new Date(sp.from) : new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const to = sp.to ? new Date(sp.to) : now;
  const entityFilter = sp.entity && sp.entity !== "all" ? sp.entity : null;
  const userFilter = sp.user && sp.user !== "all" ? sp.user : null;

  const [rows, staff] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(entityFilter ? { entity: entityFilter } : {}),
        ...(userFilter ? { performedById: userFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { performedBy: { select: { id: true, name: true } } },
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const distinctEntities = await prisma.auditLog.findMany({
    distinct: ["entity"],
    select: { entity: true },
    orderBy: { entity: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every CREATE/UPDATE/DELETE on key entities. {rows.length} row{rows.length === 1 ? "" : "s"} in range.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <DateInput name="from" defaultValue={toIsoOnly(from)} label="From" />
            <DateInput name="to" defaultValue={toIsoOnly(to)} label="To" />
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Entity</label>
              <select
                name="entity"
                defaultValue={entityFilter ?? "all"}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="all">All</option>
                {distinctEntities.map((e) => (
                  <option key={e.entity} value={e.entity}>
                    {e.entity}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">User</label>
              <select
                name="user"
                defaultValue={userFilter ?? "all"}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="all">All</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No audit rows in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-3 py-2 text-left">By</th>
                    <th className="px-3 py-2 text-left">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 tabular-nums">
                        {r.createdAt.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            r.action === "DELETE"
                              ? "danger"
                              : r.action === "CREATE"
                                ? "success"
                                : r.action === "EXPORT"
                                  ? "info"
                                  : "warning"
                          }
                        >
                          {r.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.entity}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{r.entityId}</p>
                      </td>
                      <td className="px-3 py-2">{r.performedBy?.name ?? "system"}</td>
                      <td className="max-w-md px-3 py-2 text-muted-foreground">
                        <ChangesCell
                          action={r.action}
                          entity={r.entity}
                          changesJson={r.changes}
                          metadataJson={r.metadata}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Human-readable change summary + an expandable (<details>) per-field diff.
// Server-rendered — the "dropdown" needs no client JS.
interface Diff {
  label: string;
  oldVal: string;
  newVal: string;
  oldFull: string;
  newFull: string;
}

function ChangesCell({
  action,
  entity,
  changesJson,
  metadataJson,
}: {
  action: string;
  entity: string;
  changesJson: string | null;
  metadataJson: string | null;
}) {
  const diffs = parseDiffs(changesJson);
  const metaNote = metaNoteFrom(metadataJson);

  let summary: string;
  if (action === "CREATE") summary = `Created this ${humanizeField(entity).toLowerCase()}`;
  else if (action === "DELETE") summary = `Removed this ${humanizeField(entity).toLowerCase()}`;
  else if (action === "LOGIN") summary = "Signed in";
  else if (action === "EXPORT") summary = "Exported data";
  else if (diffs.length > 0) {
    const names = diffs.map((d) => d.label);
    summary = `Changed ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3} more` : ""}`;
  } else summary = "Updated";

  if (diffs.length === 0) {
    return (
      <div className="text-sm">
        <span className="text-foreground">{summary}</span>
        {metaNote ? <p className="text-xs text-muted-foreground">{metaNote}</p> : null}
      </div>
    );
  }

  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-foreground">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
        <span>{summary}</span>
      </summary>
      <table className="mt-2 w-full">
        <tbody className="divide-y divide-[color:var(--border-light)]">
          {diffs.map((d, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-3 font-medium text-[color:var(--text-secondary)]">{d.label}</td>
              <td className="py-1">
                <span className="text-muted-foreground line-through" title={d.oldFull}>{d.oldVal}</span>
                <span className="mx-1 text-[color:var(--text-tertiary)]">→</span>
                <span className="text-foreground" title={d.newFull}>{d.newVal}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {metaNote ? <p className="mt-1 text-xs text-muted-foreground">{metaNote}</p> : null}
    </details>
  );
}

function parseDiffs(json: string | null): Diff[] {
  if (!json) return [];
  try {
    const obj = JSON.parse(json) as Record<string, { old?: unknown; new?: unknown }>;
    return Object.entries(obj).map(([k, v]) => ({
      label: humanizeField(k),
      oldVal: humanizeValue(v.old),
      newVal: humanizeValue(v.new),
      oldFull: rawString(v.old),
      newFull: rawString(v.new),
    }));
  } catch {
    return [];
  }
}

function metaNoteFrom(json: string | null): string | null {
  if (!json) return null;
  try {
    const m = JSON.parse(json) as Record<string, unknown>;
    if (!m || typeof m !== "object") return null;
    const bits: string[] = [];
    if (m.passwordReset) bits.push("Password reset");
    if (m.softDelete) bits.push("Deactivated (had history)");
    if (typeof m.reason === "string") bits.push(`Reason: ${m.reason}`);
    if (typeof m.source === "string") bits.push(`Source: ${humanizeValue(m.source)}`);
    return bits.length ? bits.join(" · ") : null;
  } catch {
    return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  gstRate: "GST rate",
  gstPercent: "GST %",
  hsnSacCode: "HSN/SAC",
  isActive: "Active",
  dob: "Date of birth",
  clientCode: "Client code",
  invoiceNumber: "Invoice no.",
  paidAmount: "Paid amount",
  basePrice: "Price",
  departmentId: "Department",
  centreId: "Centre",
  consultantId: "Consultant",
  staffId: "Staff",
  endedAt: "Ended",
  IntakeForm: "Intake form",
  ClientDoctorAssignment: "Assignment",
  ChangeRequest: "Change request",
};

function humanizeField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function rawString(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function humanizeValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === "☑" || v === "☑️") return "Checked";
  if (v === "☐") return "Unchecked";
  if (typeof v === "number") return v.toLocaleString("en-IN");
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      }
    }
    return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  }
  const s = JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function DateInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: string;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
      />
    </div>
  );
}

function toIsoOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
