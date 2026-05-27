"use client";

/**
 * Interactive pieces of the Hierarchy page.
 *
 * Server component (page.tsx) fetches staff + departments and passes them down;
 * everything here is client-side because the cards open dialogs that mutate
 * staff via /api/staff. After a mutation we `router.refresh()` so the server
 * component re-fetches and re-renders.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, Trash2, Pencil, X, Layers } from "lucide-react";
import { toast } from "sonner";

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
export interface DepartmentLite { id: string; name: string; }

const ROLE_TINT: Record<string, string> = {
  OWNER:        "bg-amber-50 text-amber-700 border-amber-200",
  ADMIN:        "bg-purple-50 text-purple-700 border-purple-200",
  CONSULTANT:   "bg-blue-50 text-blue-700 border-blue-200",
  THERAPIST:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  FRONT_OFFICE: "bg-sky-50 text-sky-700 border-sky-200",
  MANAGER:      "bg-slate-50 text-slate-700 border-slate-200",
};

const ROLES = ["ADMIN", "MANAGER", "FRONT_OFFICE", "CONSULTANT", "THERAPIST"];

const ROLE_DISPLAY: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  FRONT_OFFICE: "Front Office",
  CONSULTANT: "Consultant",
  THERAPIST: "Therapist",
};

// The project's Select trigger renders the raw value unless you pass children
// to SelectValue.
function deptName(departments: DepartmentLite[], id: string): string {
  if (!id || id === "__none") return "None";
  return departments.find((d) => d.id === id)?.name ?? "None";
}

// Uniform dimensions — every person-card gets these. Headers/clinic node are
// slightly taller but matching the same width.
export const CARD_WIDTH = "w-[210px]";
export const CARD_HEIGHT_STAFF = "min-h-[64px]";
export const CARD_HEIGHT_HEADLINE = "min-h-[76px]";

// ── Card: clickable → opens edit dialog ───────────────────────────────────
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
        className={`neumorphic-card ${CARD_WIDTH} ${prominent ? CARD_HEIGHT_HEADLINE : CARD_HEIGHT_STAFF} px-3 py-2 flex items-center gap-2 border text-left hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer`}
      >
        {icon && (
          <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${ROLE_TINT[staff.role] ?? ROLE_TINT.THERAPIST}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text-primary truncate">{staff.name}</p>
          <p className="text-[10px] text-text-tertiary truncate">{staff.designation ?? staff.department?.name ?? staff.role}</p>
        </div>
        <Pencil className="h-3 w-3 text-text-tertiary opacity-0 group-hover:opacity-100 shrink-0" />
      </button>
      {open && (
        <EditStaffDialog
          staff={staff}
          departments={departments}
          onClose={() => setOpen(false)}
          onChanged={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ── Small "+" button placed in a column header ────────────────────────────
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
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 rounded-full px-2 py-0.5 border border-dashed border-indigo-300 hover:border-indigo-600 bg-white/60"
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
          onCreated={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ── Placeholder card when a department/branch has no staff yet ────────────
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
        className={`${CARD_WIDTH} ${CARD_HEIGHT_STAFF} px-3 py-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-light text-[11px] font-semibold text-text-tertiary hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all`}
      >
        <Plus className="h-3.5 w-3.5" /> {hint}
      </button>
      {open && (
        <AddStaffDialog
          departments={departments}
          defaultRole={defaultRole}
          defaultDepartmentId={defaultDepartmentId ?? undefined}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────
function AddStaffDialog({
  departments,
  defaultRole,
  defaultDepartmentId,
  onClose,
  onCreated,
}: {
  departments: DepartmentLite[];
  defaultRole?: string;
  defaultDepartmentId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "mbd2026",
    role: defaultRole ?? "THERAPIST",
    departmentId: defaultDepartmentId ?? "",
    designation: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name || !form.email || !form.password || !form.role) {
      toast.error("Name, email, password, role are all required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/staff", {
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
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Staff added");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-surface">
        <DialogTitle className="text-base font-bold">Add staff</DialogTitle>
        <div className="space-y-3 pt-1">
          <Field label="Full name *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
          </Field>
          <Field label="Email *">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9" />
          </Field>
          <Field label="Initial password *">
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-9 font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role *">
              <Select value={form.role} onValueChange={(v) => v && setForm({ ...form, role: String(v) })}>
                <SelectTrigger className="h-9">
                  <SelectValue>{ROLE_DISPLAY[form.role] ?? form.role}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_DISPLAY[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select
                value={form.departmentId || "__none"}
                onValueChange={(v) => {
                  const next = typeof v === "string" ? v : "__none";
                  setForm({ ...form, departmentId: next === "__none" ? "" : next });
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue>{deptName(departments, form.departmentId || "__none")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Designation / title">
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Physiotherapist" className="h-9" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-border-light">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
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
  const [form, setForm] = useState({
    name: staff.name,
    role: staff.role,
    departmentId: staff.departmentId ?? "",
    designation: staff.designation ?? "",
    isActive: staff.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setForm({
      name: staff.name,
      role: staff.role,
      departmentId: staff.departmentId ?? "",
      designation: staff.designation ?? "",
      isActive: staff.isActive,
    });
  }, [staff]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          departmentId: form.departmentId || null,
          designation: form.designation || null,
          isActive: form.isActive,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (staff.role === "OWNER") { toast.error("OWNER cannot be removed"); return; }
    if (staff.role === "DEV")   { toast.error("DEV account cannot be removed"); return; }
    if (!confirm(`Remove ${staff.name}? If they have history they will be deactivated instead.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/staff/${staff.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.softDelete ? "Deactivated (has history)" : "Removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  };

  const isOwner = staff.role === "OWNER";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-surface">
        <DialogTitle className="text-base font-bold">
          Edit {staff.name}
        </DialogTitle>
        <div className="space-y-3 pt-1">
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" disabled={isOwner} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role / function">
              <Select value={form.role} onValueChange={(v) => v && setForm({ ...form, role: String(v) })}>
                <SelectTrigger className="h-9" disabled={isOwner}>
                  <SelectValue>{ROLE_DISPLAY[form.role] ?? form.role}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="OWNER">Owner</SelectItem>}
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_DISPLAY[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select
                value={form.departmentId || "__none"}
                onValueChange={(v) => {
                  const next = typeof v === "string" ? v : "__none";
                  setForm({ ...form, departmentId: next === "__none" ? "" : next });
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue>{deptName(departments, form.departmentId || "__none")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Designation / title">
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="h-9" placeholder="e.g. Senior Physiotherapist" />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} />
            <span className="text-xs font-semibold">{form.isActive ? "Active" : "Inactive"}</span>
          </div>
          <div className="text-[10px] text-text-tertiary border-t border-border-light pt-2">
            Email: <span className="font-mono">{staff.email}</span> (not editable, identifies the login).
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-3 border-t border-border-light">
          <Button
            variant="outline"
            onClick={remove}
            disabled={deleting || isOwner}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" /> Remove</>}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{label}</Label>
      {children}
    </div>
  );
}

// ── New-department creator (header button) ────────────────────────────────
export function AddDepartmentButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name required");
    setBusy(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(`Category "${trimmed}" created`);
      setName("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-surface border border-border-light hover:border-indigo-300 text-text-secondary hover:text-indigo-700 text-xs font-semibold px-3 py-2 rounded-lg shadow-sm"
      >
        <Layers className="h-3.5 w-3.5" /> New category
      </button>
      {open && (
        <Dialog open onOpenChange={(v) => !v && setOpen(false)}>
          <DialogContent className="sm:max-w-md bg-surface">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-600" /> New category
            </DialogTitle>
            <div className="space-y-3 pt-1">
              <Field label="Category name *">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Strength & Conditioning"
                  className="h-9"
                  autoFocus
                />
              </Field>
              <p className="text-[11px] text-text-tertiary">
                Categories (departments) are shared across clinics. Once created you can assign staff and services to it.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border-light">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
