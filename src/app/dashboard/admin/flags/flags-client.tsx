"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/error-messages";

interface FlagRow {
  id: string;
  type: string;
  label: string;
  color: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  clientId: string;
  clientName: string;
  clientCode: string;
}

interface ClientOption {
  id: string;
  label: string;
}

const TYPES = ["VIP", "CAUTION", "OVERDUE", "FOLLOWUP", "CUSTOM"] as const;

export function FlagsAdminView({
  flags,
  clients,
}: {
  flags: FlagRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("VIP");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId || !label.trim()) {
      toast.error("Pick a patient and enter a label");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type, label, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't add the flag." }),
        );
      }
      toast.success("Flag added");
      setLabel("");
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  async function toggle(flag: FlagRow) {
    try {
      const res = await fetch("/api/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: flag.id, isActive: !flag.isActive }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't toggle the flag." }),
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Client flags</h1>
        <p className="text-sm text-muted-foreground">
          VIP / Caution / Overdue tags surface on the patient list and detail pages.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Add flag</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Patient</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. VIP" />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="md:col-span-1 md:flex md:items-end">
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Adding…" : "Add flag"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All flags ({flags.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {flags.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={<Flag className="h-8 w-8" />}
              title="No flags yet"
              description="Add a VIP, caution, or follow-up flag above — it surfaces on the patient list and detail pages."
            />
          ) : (
            <ul className="divide-y">
              {flags.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.isActive ? "warning" : "default"}>{f.type}</Badge>
                      <span className="text-sm font-medium">{f.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <Link
                        href={`/dashboard/patients/${f.clientId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {f.clientName} ({f.clientCode})
                      </Link>
                      {f.notes ? ` · ${f.notes}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggle(f)}
                  >
                    {f.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
