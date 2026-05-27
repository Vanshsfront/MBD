"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/error-messages";

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  department: string | null;
  isActive: boolean;
}

export function StaffAdminView({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(s: StaffRow) {
    setPending(s.id);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't update staff status." }),
        );
      }
      toast.success(`${s.name} ${s.isActive ? "deactivated" : "activated"}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function resetPassword(id: string) {
    if (newPassword.length < 6) {
      toast.error("Password must be ≥ 6 chars");
      return;
    }
    setPending(id);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resetPassword: newPassword }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't reset the password." }),
        );
      }
      toast.success("Password reset");
      setResetFor(null);
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Activate / deactivate accounts, reset passwords. New-hire onboarding is a Phase 5 item.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{staff.length} staff records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {staff.map((s) => (
              <li key={s.id} className="px-6 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{s.name}</p>
                      <Badge variant={s.isActive ? "success" : "default"}>
                        {s.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                      <Badge variant="outline">{s.role}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.email}
                      {s.department ? ` · ${s.department}` : ""}
                      {s.designation ? ` · ${s.designation}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResetFor(resetFor === s.id ? null : s.id)}
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(s)}
                      disabled={pending === s.id}
                    >
                      {s.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
                {resetFor === s.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input
                      type="text"
                      placeholder="New password (≥ 6 chars)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      onClick={() => resetPassword(s.id)}
                      disabled={pending === s.id}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setResetFor(null);
                        setNewPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
