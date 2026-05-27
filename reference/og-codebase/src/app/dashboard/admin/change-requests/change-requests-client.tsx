"use client";

// FO/OWNER/ADMIN review screen for change requests (Revamp Phase 3).
// Renders the structured payload as readable cards — appointment + before/
// after times for RESCHEDULE, current → proposed therapist for REASSIGN,
// free text for OTHER. Approve calls /api/change-requests PATCH which
// transactionally mutates the underlying entity (audit-2026-05-08 fix).

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/error-messages";

export interface RescheduleSummary {
  kind: "RESCHEDULE";
  reason: string;
  fromStartIso: string;
  fromEndIso: string;
  toStartIso: string;
  toEndIso: string;
  appointment: {
    id: string;
    status: string;
    clientName: string;
    clientCode: string;
    therapistName: string;
    serviceName: string;
  } | null;
}

export interface ReassignSummary {
  kind: "REASSIGN";
  reason: string;
  client: { id: string; name: string; code: string } | null;
  fromTherapistName: string | null;
  fromServiceName: string | null;
  toTherapist: { id: string; name: string; designation: string | null } | null;
}

export interface OtherSummary {
  kind: "OTHER";
  freeText: string;
}

export interface EnrichedRequest {
  id: string;
  type: string;
  status: string;
  response: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requesterName: string;
  requesterRole: string;
  reviewedByName: string | null;
  summary: RescheduleSummary | ReassignSummary | OtherSummary | null;
}

export function ChangeRequestsView({ requests }: { requests: EnrichedRequest[] }) {
  const router = useRouter();
  const [responseFor, setResponseFor] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setPending(id);
    try {
      const res = await fetch("/api/change-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          response: responseFor[id]?.trim() || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't apply the review." }),
        );
      }
      toast.success(
        status === "APPROVED"
          ? "Approved — change applied"
          : "Rejected — requester notified",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setPending(null);
    }
  }

  const pending_ = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Change requests</h1>
        <p className="text-sm text-muted-foreground">
          Clinician-raised reschedule / reassign requests. Approve to apply the change
          automatically — the calendar / assignments update in the same transaction.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Pending ({pending_.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending_.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="divide-y">
              {pending_.map((r) => {
                // Approve calls a PATCH that transactionally mutates the
                // underlying entity. If the entity has already been deleted
                // (RESCHEDULE → appointment removed, REASSIGN → client/
                // assignment removed), the approve will fail with
                // appointment_gone / assignment_gone. Surface that as a
                // disabled button + explanation instead of letting the FO
                // click and crash.
                const dead = isApproveDead(r.summary);
                return (
                  <li key={r.id} className="px-6 py-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={badgeVariant(r.type)}>{r.type}</Badge>
                        <span className="text-sm font-medium">{r.requesterName}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.requesterRole}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {new Date(r.createdAt).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <SummaryBlock summary={r.summary} />

                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder="Optional response message"
                        value={responseFor[r.id] ?? ""}
                        onChange={(e) =>
                          setResponseFor((p) => ({ ...p, [r.id]: e.target.value }))
                        }
                        className="max-w-md"
                      />
                      <Button
                        type="button"
                        onClick={() => review(r.id, "APPROVED")}
                        disabled={pending === r.id || dead}
                        title={
                          dead
                            ? "The underlying record was removed — Approve isn't possible."
                            : undefined
                        }
                      >
                        {pending === r.id ? "Applying…" : "Approve"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => review(r.id, "REJECTED")}
                        disabled={pending === r.id}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently reviewed ({reviewed.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reviewed.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No reviewed requests.</p>
          ) : (
            <ul className="divide-y">
              {reviewed.map((r) => (
                <li key={r.id} className="space-y-2 px-6 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.status === "APPROVED" ? "success" : "danger"}>
                      {r.status}
                    </Badge>
                    <span className="text-sm font-medium">{r.requesterName}</span>
                    <span className="text-xs text-muted-foreground">· {r.type}</span>
                    <span className="text-xs text-muted-foreground">
                      · Reviewed by {r.reviewedByName ?? "—"} on{" "}
                      {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString("en-IN") : "—"}
                      {r.response ? ` · "${r.response}"` : ""}
                    </span>
                  </div>
                  <SummaryBlock summary={r.summary} compact />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function badgeVariant(type: string): "warning" | "info" | "default" {
  if (type === "RESCHEDULE") return "warning";
  if (type === "REASSIGN") return "info";
  return "default";
}

function isApproveDead(summary: EnrichedRequest["summary"]): boolean {
  if (!summary) return true;
  if (summary.kind === "RESCHEDULE") return summary.appointment === null;
  if (summary.kind === "REASSIGN") return summary.client === null;
  return false;
}

function SummaryBlock({
  summary,
  compact = false,
}: {
  summary: EnrichedRequest["summary"];
  compact?: boolean;
}) {
  if (!summary) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Payload missing or could not be parsed — manual review required.
      </p>
    );
  }
  if (summary.kind === "RESCHEDULE") {
    return (
      <div
        className={`rounded-md border bg-muted/30 px-3 py-2 text-sm ${
          compact ? "" : "space-y-1.5"
        }`}
      >
        {summary.appointment ? (
          <p className="font-medium">
            {summary.appointment.clientName}{" "}
            <span className="text-muted-foreground">
              ({summary.appointment.clientCode})
            </span>{" "}
            · {summary.appointment.serviceName}{" "}
            <span className="text-muted-foreground">
              with {summary.appointment.therapistName}
            </span>
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Original appointment was deleted — Approve will fail.
          </p>
        )}
        <p className="text-xs">
          <span className="text-muted-foreground">From:</span>{" "}
          {fmtRange(summary.fromStartIso, summary.fromEndIso)}
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">To:</span>{" "}
          <strong>{fmtRange(summary.toStartIso, summary.toEndIso)}</strong>
        </p>
        {!compact ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Reason:</span> {summary.reason}
          </p>
        ) : null}
      </div>
    );
  }
  if (summary.kind === "REASSIGN") {
    return (
      <div
        className={`rounded-md border bg-muted/30 px-3 py-2 text-sm ${
          compact ? "" : "space-y-1.5"
        }`}
      >
        {summary.client ? (
          <p className="font-medium">
            {summary.client.name}{" "}
            <span className="text-muted-foreground">({summary.client.code})</span>
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Patient record missing — Approve will fail.
          </p>
        )}
        <p className="text-xs">
          <span className="text-muted-foreground">From:</span>{" "}
          {summary.fromTherapistName ?? "—"}
          {summary.fromServiceName ? ` · ${summary.fromServiceName}` : ""}
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">To:</span>{" "}
          <strong>{summary.toTherapist?.name ?? "—"}</strong>
          {summary.toTherapist?.designation
            ? ` · ${summary.toTherapist.designation}`
            : ""}
        </p>
        {!compact ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Reason:</span> {summary.reason}
          </p>
        ) : null}
      </div>
    );
  }
  // OTHER — free-text only.
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <p className="whitespace-pre-wrap text-xs">{summary.freeText}</p>
    </div>
  );
}

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  const startFmt = s.toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endFmt = sameDay
    ? e.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : e.toLocaleString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
  return `${startFmt} → ${endFmt}`;
}
