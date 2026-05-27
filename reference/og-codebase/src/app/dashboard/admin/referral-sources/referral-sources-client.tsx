"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/error-messages";

interface SourceRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  clientCount: number;
}

export function ReferralSourcesAdminView({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setPending("new");
    try {
      const res = await fetch("/api/admin/referral-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sortOrder: sources.length }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't create the referral source." }),
        );
      }
      setName("");
      toast.success("Source added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(null);
    }
  }

  async function toggle(s: SourceRow) {
    setPending(s.id);
    try {
      const res = await fetch("/api/admin/referral-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't toggle the source." }),
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Referral sources</h1>
        <p className="text-sm text-muted-foreground">
          Used during patient assignment + the &quot;Revenue by source&quot; report.
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={create} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 flex-1">
              <Label>New source name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. LinkedIn"
              />
            </div>
            <Button type="submit" disabled={pending === "new"}>
              {pending === "new" ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {s.name}{" "}
                    <Badge variant={s.isActive ? "success" : "default"} className="ml-1">
                      {s.isActive ? "active" : "inactive"}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.clientCount} client{s.clientCount === 1 ? "" : "s"} use this source
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggle(s)}
                  disabled={pending === s.id}
                >
                  {s.isActive ? "Deactivate" : "Activate"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
