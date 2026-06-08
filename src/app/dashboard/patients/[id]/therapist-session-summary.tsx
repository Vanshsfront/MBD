"use client";

// Compact session-count chip for therapist role on the patient detail page.
// Replaces the /packages tab entirely for therapists: shows nothing about
// pricing, service-mix, or invoices — only "X done / Y booked / Z left"
// per active package. Plus a "Suggest package" button that posts a free-
// text note to FO's queue. Server-side gate in /packages/page.tsx redirects
// THERAPIST away, so this is the only package surface they touch.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { readApiError } from "@/lib/error-messages";

interface PackageSummary {
  id: string;
  name: string;
  totalSessions: number;
  completedSessions: number;
  validUntil: string;
  status: string;
}

interface Props {
  clientId: string;
  packages: PackageSummary[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function TherapistSessionSummary({ clientId, packages }: Props) {
  const active = packages.filter((p) => p.status === "ACTIVE");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
        <h2 className="text-base font-semibold">Sessions</h2>
        <SuggestPackageDialog clientId={clientId} />
      </div>
      <div className="p-5">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active package. If the patient should have one, use{" "}
            <span className="font-medium">Suggest package</span> to push a note to the front desk.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border-light)]">
            {active.map((p) => {
              const remaining = Math.max(0, p.totalSessions - p.completedSessions);
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.completedSessions}/{p.totalSessions} done · {remaining} left · expires {formatDate(p.validUntil)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function SuggestPackageDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!note.trim()) {
      toast.error("Add a note before submitting.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/package-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, note: note.trim() }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't submit the suggestion." }));
      }
      toast.success("Suggestion sent to front desk");
      setNote("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">Suggest package</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Suggest a package</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Pushed to the front desk as a pending suggestion. They&apos;ll review the patient context
          and create the package with the right pricing.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="suggest-note">Suggestion</Label>
          <textarea
            id="suggest-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="e.g. 12 physio sessions over 6 weeks for chronic LBP — needs core + glute med focus."
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Sending…" : "Send to front desk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
