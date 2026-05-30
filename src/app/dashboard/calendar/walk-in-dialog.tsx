"use client";

// Walk-in / intake-pending booking. The FO can reserve a slot for a patient
// who hasn't done intake yet — only name + phone + therapist + time. On
// submit:
//   1. POST /api/clients/walk-in → creates a stub Client (intakeStatus =
//      PENDING_INTAKE).
//   2. POST /api/appointments with the returned clientId and serviceId=null
//      (FO-style booking — the therapist or FO sets the service later).
// The patient row gets a yellow "Intake pending" chip in the patient list;
// the calendar event also renders with a yellow border (via .mbd-evt-pending
// class). When the patient arrives and completes intake on-behalf, the
// intake handler flips intakeStatus back to COMPLETED.

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneField, validatePhone } from "@/components/ui/phone-field";
import { readApiError } from "@/lib/error-messages";

interface TherapistOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO start, used to prefill the new appointment time. */
  startIso: string;
  /** ISO end, used to prefill the duration. */
  endIso: string;
  therapists: TherapistOption[];
  onCreated?: () => void;
}

function isoToLocalDateTime(iso: string): string {
  // Convert ISO UTC to a "YYYY-MM-DDTHH:MM" value the <input type="datetime-local">
  // expects. Strip the seconds + Z so the field is happy.
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(15, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

export function WalkInAppointmentDialog({
  open,
  onOpenChange,
  startIso,
  endIso,
  therapists,
  onCreated,
}: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [startLocal, setStartLocal] = useState(() => isoToLocalDateTime(startIso));
  const [durationMin, setDurationMin] = useState(() => minutesBetween(startIso, endIso));
  const [pending, setPending] = useState(false);

  function close() {
    if (pending) return;
    setFirstName("");
    setLastName("");
    setPhone("");
    setTherapistId(therapists[0]?.id ?? "");
    onOpenChange(false);
  }

  async function submit() {
    if (!firstName.trim()) {
      toast.error("First name is required.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Phone number is required.");
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      toast.error(phoneErr);
      return;
    }
    if (!therapistId) {
      toast.error("Pick a therapist.");
      return;
    }
    setPending(true);
    try {
      // Step 1: create the stub client.
      const r1 = await fetch("/api/clients/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone }),
      });
      if (!r1.ok) {
        throw new Error(await readApiError(r1, { fallback: "Couldn't create the walk-in client." }));
      }
      const { client } = (await r1.json()) as { client: { id: string } };

      // Step 2: create the appointment against the new client, no service.
      const startDate = new Date(startLocal);
      const endDate = new Date(startDate.getTime() + durationMin * 60_000);
      const r2 = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          therapistId,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        }),
      });
      if (!r2.ok) {
        throw new Error(
          await readApiError(r2, { fallback: "Slot reserved partially — client created but the appointment failed." }),
        );
      }
      toast.success(`Slot reserved · ${firstName} ${lastName} · intake pending`);
      onCreated?.();
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reserve the slot.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Walk-in slot · intake pending</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Reserves a slot for a patient who hasn&apos;t done intake yet. They&apos;ll appear on
          the patients list with an &quot;Intake pending&quot; badge; complete the intake when they arrive.
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wi-first">First name *</Label>
              <Input
                id="wi-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-last">Last name</Label>
              <Input
                id="wi-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={pending}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-phone">Phone *</Label>
            <PhoneField
              id="wi-phone"
              value={phone}
              onChange={setPhone}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-therapist">Therapist *</Label>
            <Select value={therapistId} onValueChange={setTherapistId} disabled={pending}>
              <SelectTrigger id="wi-therapist">
                <SelectValue placeholder="Pick a therapist" />
              </SelectTrigger>
              <SelectContent>
                {therapists.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wi-start">Start</Label>
              <Input
                id="wi-start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-dur">Duration (min)</Label>
              <Input
                id="wi-dur"
                type="number"
                min={15}
                max={240}
                step={15}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(15, Number(e.target.value)))}
                disabled={pending}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Reserving…" : "Reserve slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
