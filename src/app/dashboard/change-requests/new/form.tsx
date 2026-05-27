"use client";

// Structured change-request creator (Revamp Phase 3). Replaces the prior
// free-text form. Each request type collects the specific fields the FO
// approve flow needs to actually mutate state:
//   RESCHEDULE — appointmentId + new start/end + reason
//   REASSIGN   — clientId + fromAssignmentId + toStaffId + reason
//   OTHER      — free-text only (FO acts manually)
// The server stores the structured payload on ChangeRequest.payloadJson.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/error-messages";

interface AppointmentOption {
  id: string;
  startIso: string;
  endIso: string;
  clientName: string;
  clientCode: string;
  serviceName: string;
}

interface AssignmentOption {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  isPrimary: boolean;
  serviceName: string | null;
}

interface CandidateStaff {
  id: string;
  name: string;
  designation: string | null;
}

interface Props {
  appointments: AppointmentOption[];
  assignments: AssignmentOption[];
  candidateStaff: CandidateStaff[];
}

type Type = "RESCHEDULE" | "REASSIGN" | "OTHER";

function localDtInput(iso: string): string {
  // FullCalendar / DB store UTC ISO; <input type="datetime-local"> wants
  // YYYY-MM-DDTHH:mm in the *local* zone. Strip the timezone bits.
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDtInputToIso(s: string): string {
  if (!s) return "";
  // Browser parses YYYY-MM-DDTHH:mm as local time.
  return new Date(s).toISOString();
}

export function NewChangeRequestForm({ appointments, assignments, candidateStaff }: Props) {
  const router = useRouter();
  const [type, setType] = useState<Type>("RESCHEDULE");

  // RESCHEDULE state
  const [appointmentId, setAppointmentId] = useState<string>("");
  const [newStart, setNewStart] = useState<string>("");
  const [newEnd, setNewEnd] = useState<string>("");

  // REASSIGN state
  const [assignmentId, setAssignmentId] = useState<string>("");
  const [toStaffId, setToStaffId] = useState<string>("");

  const [reason, setReason] = useState<string>("");
  const [pending, setPending] = useState(false);

  const selectedAppt = useMemo(
    () => appointments.find((a) => a.id === appointmentId) ?? null,
    [appointments, appointmentId],
  );
  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === assignmentId) ?? null,
    [assignments, assignmentId],
  );

  // When the user picks an appointment, default the new-start/end to the
  // existing slot — they only need to nudge times rather than retype the date.
  function pickAppointment(id: string) {
    setAppointmentId(id);
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return;
    setNewStart(localDtInput(appt.startIso));
    setNewEnd(localDtInput(appt.endIso));
  }

  function validate(): string | null {
    if (!reason.trim()) return "Reason is required.";
    if (type === "RESCHEDULE") {
      if (!appointmentId) return "Pick the appointment to move.";
      if (!newStart || !newEnd) return "Set the new start and end times.";
      const s = new Date(newStart);
      const e = new Date(newEnd);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()))
        return "New times are invalid.";
      if (e <= s) return "End must be after start.";
    } else if (type === "REASSIGN") {
      if (!assignmentId) return "Pick the assignment to hand off.";
      if (!toStaffId) return "Pick the new therapist.";
    }
    return null;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    let payload: Record<string, unknown>;
    if (type === "RESCHEDULE" && selectedAppt) {
      payload = {
        appointmentId,
        fromStartIso: selectedAppt.startIso,
        fromEndIso: selectedAppt.endIso,
        toStartIso: localDtInputToIso(newStart),
        toEndIso: localDtInputToIso(newEnd),
        reason: reason.trim(),
      };
    } else if (type === "REASSIGN" && selectedAssignment) {
      payload = {
        clientId: selectedAssignment.clientId,
        fromAssignmentId: assignmentId,
        toStaffId,
        reason: reason.trim(),
      };
    } else {
      payload = { freeText: reason.trim() };
    }

    setPending(true);
    try {
      const res = await fetch("/api/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't submit the change request." }),
        );
      }
      toast.success("Change request submitted");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(["RESCHEDULE", "REASSIGN", "OTHER"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    type === t
                      ? "border-primary bg-secondary"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {t === "RESCHEDULE"
                    ? "Reschedule"
                    : t === "REASSIGN"
                      ? "Reassign therapist"
                      : "Other"}
                </button>
              ))}
            </div>
          </div>

          {type === "RESCHEDULE" ? (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Appointment</Label>
                <Select
                  value={appointmentId}
                  onValueChange={pickAppointment}
                  disabled={appointments.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        appointments.length === 0
                          ? "You have no upcoming appointments"
                          : "Select an appointment…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {appointments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {fmt(a.startIso)} — {a.clientName} ({a.clientCode}) · {a.serviceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAppt ? (
                <p className="text-xs text-muted-foreground">
                  Currently scheduled: {fmt(selectedAppt.startIso)} →{" "}
                  {fmtTime(selectedAppt.endIso)}.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>New start</Label>
                  <Input
                    type="datetime-local"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    disabled={!appointmentId}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>New end</Label>
                  <Input
                    type="datetime-local"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    disabled={!appointmentId}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {type === "REASSIGN" ? (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Patient / assignment</Label>
                <Select
                  value={assignmentId}
                  onValueChange={setAssignmentId}
                  disabled={assignments.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        assignments.length === 0
                          ? "You have no active assignments"
                          : "Select a patient…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.clientName} ({a.clientCode})
                        {a.isPrimary ? " · primary" : ""}
                        {a.serviceName ? ` · ${a.serviceName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>New therapist (same department)</Label>
                <Select
                  value={toStaffId}
                  onValueChange={setToStaffId}
                  disabled={candidateStaff.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        candidateStaff.length === 0
                          ? "No other staff in your department"
                          : "Select…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.designation ? ` · ${s.designation}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              placeholder="e.g. patient asked to move to evening / personal emergency"
              required
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
