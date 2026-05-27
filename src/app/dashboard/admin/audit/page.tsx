import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
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
                        <ChangesCell changesJson={r.changes} metadataJson={r.metadata} />
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

function ChangesCell({
  changesJson,
  metadataJson,
}: {
  changesJson: string | null;
  metadataJson: string | null;
}) {
  const lines: string[] = [];
  if (changesJson) {
    try {
      const obj = JSON.parse(changesJson) as Record<string, { old?: unknown; new?: unknown }>;
      for (const [k, v] of Object.entries(obj)) {
        const ov = v.old === undefined ? "—" : JSON.stringify(v.old);
        const nv = v.new === undefined ? "—" : JSON.stringify(v.new);
        lines.push(`${k}: ${ov} → ${nv}`);
      }
    } catch {
      /* ignore */
    }
  }
  if (metadataJson && lines.length === 0) {
    lines.push(metadataJson.slice(0, 120));
  }
  if (lines.length === 0) return <span>—</span>;
  return (
    <div className="space-y-0.5 font-mono text-[11px]">
      {lines.slice(0, 4).map((l, i) => (
        <p key={i} className="truncate">
          {l}
        </p>
      ))}
      {lines.length > 4 ? (
        <p className="text-[10px] text-muted-foreground">…{lines.length - 4} more</p>
      ) : null}
    </div>
  );
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
