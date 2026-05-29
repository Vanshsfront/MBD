"use client";

// Shared Add/Edit staff dialogs used by both the Staff admin list and the
// Hierarchy org-chart. Talks to OG's secure /api/admin/staff (POST/PATCH/DELETE);
// performedById is derived server-side from the session.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readApiError } from "@/lib/error-messages";
import type { Role } from "@/lib/permissions";
import { RolePermissionsPreview } from "./role-permissions-preview";

export interface StaffLite {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  isActive: boolean;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
}
export interface DepartmentLite {
  id: string;
  name: string;
}

export const ASSIGNABLE_ROLES = ["ADMIN", "FRONT_OFFICE", "CONSULTANT", "THERAPIST"] as const;

export const ROLE_DISPLAY: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  FRONT_OFFICE: "Front Office",
  CONSULTANT: "Consultant",
  THERAPIST: "Therapist",
  DEV: "Dev",
};

const NONE = "__none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function deptName(departments: DepartmentLite[], id: string): string {
  if (!id || id === NONE) return "None";
  return departments.find((d) => d.id === id)?.name ?? "None";
}

export function AddStaffDialog({
  departments,
  defaultRole,
  defaultDepartmentId,
  onClose,
  onCreated,
}: {
  departments: DepartmentLite[];
  defaultRole?: string;
  defaultDepartmentId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const initialRole = ASSIGNABLE_ROLES.includes((defaultRole ?? "") as (typeof ASSIGNABLE_ROLES)[number])
    ? (defaultRole as string)
    : "THERAPIST";
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "mbd2026",
    role: initialRole,
    departmentId: defaultDepartmentId ?? "",
    designation: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name || !form.email || !form.password) {
      toast.error("Name, email and password are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          departmentId: form.departmentId || null,
          designation: form.designation || null,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, { fallback: "Couldn't add staff." }));
      toast.success(`${form.name} added`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Full name *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dr. Asha Rao (PT)" />
          </Field>
          <Field label="Email *">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@mbd.in" />
          </Field>
          <Field label="Initial password *">
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role *">
              <Select value={form.role} onValueChange={(v) => v && setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue>{ROLE_DISPLAY[form.role] ?? form.role}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_DISPLAY[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select
                value={form.departmentId || NONE}
                onValueChange={(v) => setForm({ ...form, departmentId: v === NONE ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue>{deptName(departments, form.departmentId || NONE)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Designation / title">
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Physiotherapist" />
          </Field>
          <RolePermissionsPreview role={form.role as Role} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditStaffDialog({
  staff,
  departments,
  onClose,
  onChanged,
}: {
  staff: StaffLite;
  departments: DepartmentLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const isPrivileged = staff.role === "OWNER" || staff.role === "DEV";
  const [form, setForm] = useState({
    name: staff.name,
    role: staff.role,
    departmentId: staff.departmentId ?? "",
    designation: staff.designation ?? "",
    isActive: staff.isActive,
    newPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (form.newPassword && form.newPassword.length < 6) {
      toast.error("New password must be ≥ 6 chars");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: staff.id,
          name: form.name,
          role: form.role,
          departmentId: form.departmentId || null,
          designation: form.designation || null,
          isActive: form.isActive,
          resetPassword: form.newPassword || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, { fallback: "Couldn't save changes." }));
      toast.success("Saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (isPrivileged) {
      toast.error(`${ROLE_DISPLAY[staff.role]} cannot be removed`);
      return;
    }
    if (!confirm(`Remove ${staff.name}? If they have history they'll be deactivated instead.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: staff.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { softDelete?: boolean };
      if (!res.ok) throw new Error(await readApiError(res, { fallback: "Couldn't remove staff." }));
      toast.success(data.softDelete ? "Deactivated (has history)" : "Removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {staff.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={form.role} onValueChange={(v) => v && setForm({ ...form, role: v })}>
                <SelectTrigger disabled={isPrivileged}>
                  <SelectValue>{ROLE_DISPLAY[form.role] ?? form.role}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {isPrivileged && <SelectItem value={staff.role}>{ROLE_DISPLAY[staff.role]}</SelectItem>}
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_DISPLAY[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select
                value={form.departmentId || NONE}
                onValueChange={(v) => setForm({ ...form, departmentId: v === NONE ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue>{deptName(departments, form.departmentId || NONE)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Designation / title">
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Physiotherapist" />
          </Field>
          <Field label="Reset password (optional)">
            <Input
              type="text"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              placeholder="Leave blank to keep current"
              className="font-mono"
            />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} />
            <span className="text-xs font-semibold">{form.isActive ? "Active" : "Inactive"}</span>
          </div>
          <RolePermissionsPreview role={form.role as Role} />
          <p className="border-t border-[color:var(--border-light)] pt-2 text-[10px] text-[color:var(--text-tertiary)]">
            Email <span className="font-mono">{staff.email}</span> is not editable (it identifies the login).
          </p>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={remove}
            disabled={deleting || isPrivileged}
            className="text-destructive"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="mr-1 h-4 w-4" /> Remove</>}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
