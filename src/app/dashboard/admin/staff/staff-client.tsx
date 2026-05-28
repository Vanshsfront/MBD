"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Link2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AddStaffDialog,
  EditStaffDialog,
  ROLE_DISPLAY,
  type StaffLite,
  type DepartmentLite,
} from "@/components/admin/staff-dialogs";
import { staffColor } from "@/lib/staff-colors";

export function StaffAdminView({
  staff,
  departments,
}: {
  staff: StaffLite[];
  departments: DepartmentLite[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffLite | null>(null);
  const [query, setQuery] = useState("");

  const filtered = staff.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      (s.department?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground">
            Add employees, edit roles &amp; departments, reset passwords, deactivate. See the{" "}
            <a href="/dashboard/admin/hierarchy" className="inline-flex items-center gap-1 font-medium text-primary">
              <Link2 className="h-3.5 w-3.5" /> org chart
            </a>{" "}
            for a visual view.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="mr-1 h-4 w-4" /> Add staff
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{filtered.length} of {staff.length} staff</CardTitle>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, role, department…"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={<Users className="h-8 w-8" />}
              title={staff.length === 0 ? "No staff yet" : "No staff match your search"}
              description={
                staff.length === 0
                  ? "Add your first team member with the Add staff button above."
                  : "Try a different name, email, role, or department."
              }
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="mt-0.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: staffColor(s.id, s.color) }}
                        title={s.color ? `Calendar colour ${s.color}` : "Calendar colour (auto)"}
                      />
                      <div>
                        <p className="text-sm font-medium text-[color:var(--text-primary)]">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.email}
                          {s.designation ? ` · ${s.designation}` : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_DISPLAY[s.role] ?? s.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.department?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "success" : "default"}>
                      {s.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {adding && (
        <AddStaffDialog
          departments={departments}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <EditStaffDialog
          key={editing.id}
          staff={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
