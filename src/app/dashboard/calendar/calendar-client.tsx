"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type {
  DateSelectArg,
  EventApi,
  EventChangeArg,
  EventClickArg,
} from "@fullcalendar/core";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECT_NONE } from "@/lib/select-styles";
import { readApiError } from "@/lib/error-messages";

interface TherapistOption {
  id: string;
  name: string;
  departmentId: string | null;
  department: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
  basePrice: number;
  departmentId: string;
  participantCount: number;
}

interface ClientOption {
  id: string;
  label: string;
  therapistIds: string[];
}

interface AppointmentEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  status: string;
  therapistId: string;
  therapistName: string;
  clientId: string;
  serviceId: string;
  serviceName: string;
  flags: ReadonlyArray<{ type: string; label: string; color: string | null }>;
  hasClash: boolean;
  pendingReschedule: boolean;
}

interface Props {
  currentUserId: string;
  isClinicalRole: boolean;
  canBook: boolean;
  therapists: TherapistOption[];
  services: ServiceOption[];
  clients: ClientOption[];
}

export function CalendarClient({
  currentUserId,
  isClinicalRole,
  canBook,
  therapists,
  services,
  clients,
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [therapistFilter, setTherapistFilter] = useState<string>(
    isClinicalRole ? currentUserId : "",
  );
  const [creating, setCreating] = useState<{ start: string; end: string } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AppointmentEvent | null>(null);

  function fetchEvents(start: Date, end: Date) {
    const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
    if (therapistFilter && !isClinicalRole) params.set("therapistId", therapistFilter);
    return fetch(`/api/appointments?${params.toString()}`)
      .then((r) => r.json())
      .then((rows: AppointmentEvent[]) => rows);
  }

  // Refresh on filter change.
  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents();
  }, [therapistFilter]);

  function onSelect(info: DateSelectArg) {
    if (!canBook) return;
    setCreating({ start: info.start.toISOString(), end: info.end.toISOString() });
  }

  // Open the create dialog without drag-selecting. Defaults to the next
  // 30-min slot from now, 60-min duration. Inside the dialog the FO can
  // still edit date/time/duration granularly.
  function openCreateNow() {
    if (!canBook) return;
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(now.getMinutes() <= 30 ? 30 : 0);
    if (now.getMinutes() > 30) start.setHours(now.getHours() + 1);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setCreating({ start: start.toISOString(), end: end.toISOString() });
  }

  async function onChange(info: EventChangeArg) {
    if (!canBook) {
      info.revert();
      return;
    }
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: info.event.id,
          startTime: info.event.start?.toISOString(),
          endTime: info.event.end?.toISOString(),
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't move the appointment." }));
      }
      const data = (await res.json().catch(() => ({}))) as { warning?: string };
      toast.success("Appointment moved");
      if (data.warning) toast.warning(data.warning);
    } catch (err) {
      info.revert();
      toast.error(err instanceof Error ? err.message : "Move failed");
    }
  }

  function onClick(info: EventClickArg) {
    setSelectedEvent(eventToView(info.event));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {canBook
              ? "Click + New appointment, or drag-create on the grid. Drag to move."
              : "Read-only view of your day. Use Change requests to propose reschedules."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isClinicalRole ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="therapist-filter" className="text-xs">
                Therapist
              </Label>
              <Select
                value={therapistFilter === "" ? SELECT_NONE : therapistFilter}
                onValueChange={(v) => setTherapistFilter(v === SELECT_NONE ? "" : v)}
              >
                <SelectTrigger id="therapist-filter" className="w-48">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>All</SelectItem>
                  {therapists.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {canBook ? (
            <Button onClick={openCreateNow} size="sm">
              + New appointment
            </Button>
          ) : null}
        </div>
      </header>

      {/* Legend strip — colour cue cards for status. Sits between the page
        * header and the calendar canvas; matches the legend in the design
        * handoff (audit n=4). The Therapist filter above stays as the
        * primary cut; this strip just explains the colour story below. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-card/60 px-4 py-2.5 text-xs text-[color:var(--text-secondary)] ring-1 ring-[color:var(--border-light)]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">
          Legend
        </span>
        <LegendDot color="var(--chart-1)" label="Confirmed" />
        <LegendDot color="var(--chart-3)" label="Completed" />
        <LegendDot color="var(--text-tertiary)" label="Cancelled / no-show" />
        <LegendDot color="var(--danger)" label="Conflict" />
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Drag an event to reschedule · click for details
        </span>
      </div>

      <Card>
        <CardContent className="p-2">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={false}
            nowIndicator
            selectable={canBook}
            selectMirror
            editable={canBook}
            eventStartEditable={canBook}
            eventResizableFromStart={canBook}
            select={onSelect}
            eventChange={onChange}
            eventClick={onClick}
            events={(info, success, failure) => {
              fetchEvents(info.start, info.end).then(success).catch(failure);
            }}
            eventClassNames={(arg) => {
              const status = (arg.event.extendedProps.status as string) ?? "CONFIRMED";
              const classes: string[] = [];
              if (status === "CANCELLED" || status === "NO_SHOW") classes.push("mbd-evt-cancelled");
              else if (status === "COMPLETED") classes.push("mbd-evt-completed");
              else classes.push("mbd-evt-confirmed");
              if (arg.event.extendedProps.hasClash) classes.push("mbd-evt-clash");
              if (arg.event.extendedProps.pendingReschedule) classes.push("mbd-evt-pending-rsch");
              return classes;
            }}
            eventContent={(arg) => {
              const flags = (arg.event.extendedProps.flags as ReadonlyArray<{ type: string; label: string }>) ?? [];
              const hasClash = Boolean(arg.event.extendedProps.hasClash);
              const pendingRsch = Boolean(arg.event.extendedProps.pendingReschedule);
              // Tiny inline pills: ⚠ for clash, ⟲ for pending reschedule,
              // first flag label as a chip. Tooltip carries the full list.
              const flagTitle = flags.length > 0 ? flags.map((f) => `${f.type}: ${f.label}`).join(" · ") : "";
              return {
                html: `<div class="text-xs px-1 leading-tight" title="${escapeHtml(flagTitle)}">
  <div class="font-medium truncate">${escapeHtml(arg.event.title)}</div>
  <div class="opacity-80 truncate">${escapeHtml(arg.event.extendedProps.therapistName as string ?? "")}</div>
  <div class="flex gap-1 mt-0.5">
    ${hasClash ? '<span class="mbd-evt-pill mbd-evt-pill-danger">⚠ clash</span>' : ""}
    ${pendingRsch ? '<span class="mbd-evt-pill mbd-evt-pill-warning">⟲ resch.</span>' : ""}
    ${flags.slice(0, 2).map((f) => `<span class="mbd-evt-pill" title="${escapeHtml(f.type)}">${escapeHtml(f.label)}</span>`).join("")}
  </div>
</div>`,
              };
            }}
          />
        </CardContent>
      </Card>

      <CalendarStyles />

      {creating ? (
        <CreateAppointmentDialog
          start={creating.start}
          end={creating.end}
          therapists={therapists}
          services={services}
          clients={clients}
          onClose={(refreshed) => {
            setCreating(null);
            if (refreshed) calendarRef.current?.getApi().refetchEvents();
          }}
        />
      ) : null}

      {selectedEvent ? (
        <EventDetailDialog
          event={selectedEvent}
          canEdit={canBook}
          onClose={(refreshed) => {
            setSelectedEvent(null);
            if (refreshed) calendarRef.current?.getApi().refetchEvents();
          }}
        />
      ) : null}
    </div>
  );
}

function eventToView(e: EventApi): AppointmentEvent {
  return {
    id: e.id,
    title: e.title,
    start: e.start?.toISOString() ?? "",
    end: e.end?.toISOString() ?? "",
    status: (e.extendedProps.status as string) ?? "CONFIRMED",
    therapistId: (e.extendedProps.therapistId as string) ?? "",
    therapistName: (e.extendedProps.therapistName as string) ?? "",
    clientId: (e.extendedProps.clientId as string) ?? "",
    serviceId: (e.extendedProps.serviceId as string) ?? "",
    serviceName: (e.extendedProps.serviceName as string) ?? "",
    flags:
      (e.extendedProps.flags as ReadonlyArray<{ type: string; label: string; color: string | null }>) ?? [],
    hasClash: Boolean(e.extendedProps.hasClash),
    pendingReschedule: Boolean(e.extendedProps.pendingReschedule),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function CalendarStyles() {
  return (
    <style jsx global>{`
      .fc {
        --fc-border-color: var(--border);
        --fc-page-bg-color: transparent;
        --fc-neutral-bg-color: var(--muted);
        font-family: var(--font-geist-sans), system-ui, sans-serif;
      }
      .fc .fc-button {
        background: var(--secondary);
        color: var(--secondary-foreground);
        border: 1px solid var(--border);
      }
      /* Mobile: stack toolbar in three rows (prev/today/next · title · views)
       * so the date title doesn't compete with two button clusters and
       * wrap vertically. */
      @media (max-width: 640px) {
        .fc .fc-toolbar.fc-header-toolbar {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: stretch;
        }
        .fc .fc-toolbar-chunk {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 4px;
        }
        .fc .fc-toolbar-title {
          font-size: 15px;
          font-weight: 600;
          white-space: nowrap;
          text-align: center;
        }
      }
      .fc .fc-button-primary:not(:disabled).fc-button-active,
      .fc .fc-button-primary:not(:disabled):active {
        background: var(--primary);
        color: var(--primary-foreground);
      }
      .mbd-evt-confirmed {
        background: var(--primary);
        border-color: var(--primary);
        color: var(--primary-foreground);
      }
      .mbd-evt-completed {
        background: oklch(0.7 0.12 150);
        border-color: oklch(0.65 0.12 150);
        color: white;
      }
      .mbd-evt-cancelled {
        background: oklch(0.85 0.05 30);
        border-color: oklch(0.78 0.07 30);
        color: oklch(0.3 0.1 30);
        opacity: 0.7;
        text-decoration: line-through;
      }
      /* Clash + pending-reschedule decorations stack on top of the status
       * colour. Clash wins visually (red ring) because it's blocking. */
      .mbd-evt-clash {
        box-shadow: 0 0 0 2px var(--danger), 0 2px 6px rgba(220,53,69,0.25);
      }
      .mbd-evt-pending-rsch:not(.mbd-evt-clash) {
        box-shadow: 0 0 0 2px var(--warning, #d97706), 0 2px 6px rgba(217,119,6,0.20);
      }
      /* Inline pills inside the event body. Kept small and uppercase so
       * they read as labels, not text. */
      .mbd-evt-pill {
        display: inline-flex; align-items: center;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 9px; font-weight: 600;
        letter-spacing: 0.04em;
        background: rgba(255,255,255,0.22);
        color: inherit;
        line-height: 1.2;
        white-space: nowrap;
      }
      .mbd-evt-pill-danger {
        background: var(--danger);
        color: #fff;
      }
      .mbd-evt-pill-warning {
        background: #d97706;
        color: #fff;
      }
    `}</style>
  );
}

// Local datetime <input> uses "YYYY-MM-DDTHH:mm" (no seconds, no timezone).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TopTherapist {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  visits: number;
}

interface ActivePackage {
  id: string;
  totalSessions: number;
  completedSessions: number;
  remainingForService: number;
  validUntil: string;
  serviceName: string | null;
}

function CreateAppointmentDialog({
  start,
  end,
  therapists,
  services,
  clients,
  onClose,
}: {
  start: string;
  end: string;
  therapists: TherapistOption[];
  services: ServiceOption[];
  clients: ClientOption[];
  onClose: (refreshed: boolean) => void;
}) {
  const [clientId, setClientId] = useState<string>("");
  const [therapistId, setTherapistId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [topTherapists, setTopTherapists] = useState<TopTherapist[]>([]);
  const [activePackages, setActivePackages] = useState<ActivePackage[]>([]);
  const [consumeFromPackageId, setConsumeFromPackageId] = useState<string | null>(null);
  const [addAssignmentConfirmed, setAddAssignmentConfirmed] = useState<boolean | null>(null);
  // Editable date/time/duration so the FO can adjust the seeded slot.
  const [startLocal, setStartLocal] = useState(() => toLocalInput(start));
  const [durationMin, setDurationMin] = useState(() => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(15, Math.round(ms / 60000));
  });

  // Fetch top-3 therapists when patient picks. Failure is non-fatal — the
  // accordion below still works. Defer through a microtask so the sync
  // setState resets at the top run outside the effect body (avoids the
  // react-hooks/set-state-in-effect lint hit).
  useEffect(() => {
    void Promise.resolve().then(() => {
      setTopTherapists([]);
      setTherapistId("");
      setServiceId("");
    });
    if (!clientId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/top-therapists`);
        if (!res.ok) return;
        const data = (await res.json()) as { topTherapists: TopTherapist[] };
        setTopTherapists(data.topTherapists ?? []);
      } catch {
        /* ignore — fallback to picker */
      }
    })();
  }, [clientId]);

  // After service + patient are picked, ask the server whether this patient
  // has an active package that can fund this service.
  useEffect(() => {
    void Promise.resolve().then(() => {
      setActivePackages([]);
      setConsumeFromPackageId(null);
    });
    if (!clientId || !serviceId) return;
    void (async () => {
      try {
        const res = await fetch("/api/appointments/check-package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, serviceId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { activePackages: ActivePackage[] };
        setActivePackages(data.activePackages ?? []);
      } catch {
        /* ignore — booking still works without package */
      }
    })();
  }, [clientId, serviceId]);

  // Is the chosen therapist already on this patient's plan? Drives the
  // "Add to plan?" prompt.
  const therapistAlreadyOnPlan = useMemo(() => {
    if (!clientId || !therapistId) return true;
    const c = clients.find((x) => x.id === clientId);
    return c?.therapistIds.includes(therapistId) ?? false;
  }, [clientId, therapistId, clients]);

  const servicesByDepartment = useMemo(() => {
    const t = therapists.find((x) => x.id === therapistId);
    // Default-scoped: therapist's own dept appears first, others collapsed.
    const groups = new Map<string, ServiceOption[]>();
    for (const s of services) {
      const dep = services.find((x) => x.id === s.id)?.departmentId ?? "Other";
      if (!groups.has(dep)) groups.set(dep, []);
      groups.get(dep)!.push(s);
    }
    // Pretty-name groups: map departmentId → name via the therapist roster.
    const deptNames = new Map<string, string>();
    for (const tt of therapists) {
      if (tt.departmentId && tt.department) deptNames.set(tt.departmentId, tt.department);
    }
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (t?.departmentId === a) return -1;
      if (t?.departmentId === b) return 1;
      return (deptNames.get(a) ?? a).localeCompare(deptNames.get(b) ?? b);
    });
    return sorted.map(([id, list]) => ({ id, name: deptNames.get(id) ?? "Other", services: list }));
  }, [services, therapists, therapistId]);

  const [openServiceDept, setOpenServiceDept] = useState<string | null>(null);
  // Auto-open the chosen therapist's department when they switch. Deferred
  // via microtask to keep react-hooks/set-state-in-effect quiet.
  useEffect(() => {
    const t = therapists.find((x) => x.id === therapistId);
    if (!t?.departmentId) return;
    const dept = t.departmentId;
    void Promise.resolve().then(() => setOpenServiceDept(dept));
  }, [therapistId, therapists]);

  async function submit() {
    if (!clientId || !therapistId || !serviceId) {
      toast.error("Patient, therapist, and service are all required");
      return;
    }
    // Compose start/end from the local input + duration spinner.
    const startDate = new Date(startLocal);
    if (Number.isNaN(startDate.getTime())) {
      toast.error("Pick a valid start time");
      return;
    }
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);

    // If the therapist isn't on the plan and the FO hasn't decided yet,
    // force a decision before we book.
    if (!therapistAlreadyOnPlan && addAssignmentConfirmed === null) {
      toast.error("Decide whether to add the therapist to the patient's plan first.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          therapistId,
          serviceId,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          notes: notes.trim() || undefined,
          consumeFromPackageId: consumeFromPackageId ?? undefined,
          addAssignment: !therapistAlreadyOnPlan && addAssignmentConfirmed === true,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't book the appointment." }));
      }
      const data = (await res.json().catch(() => ({}))) as {
        warning?: string;
        consumedPackage?: { completedSessions: number };
        addedAssignment?: boolean;
      };
      toast.success("Appointment booked");
      if (data.warning) toast.warning(data.warning);
      if (data.consumedPackage) {
        toast.success(`Package decremented — ${data.consumedPackage.completedSessions} sessions used`);
      }
      if (data.addedAssignment) {
        toast.success("Therapist added to patient's plan");
      }
      onClose(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Book failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {/* Date / time / duration */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={15}
                max={240}
                step={15}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(15, Number(e.target.value)))}
              />
            </div>
          </div>

          {/* Patient picker */}
          <div className="space-y-1.5">
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

          {/* Top-3 therapists chip row */}
          {clientId && topTherapists.length > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Top therapists for this patient</Label>
              <div className="flex flex-wrap gap-2">
                {topTherapists.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTherapistId(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      therapistId === t.id
                        ? "border-[color:var(--primary)] bg-[rgba(42,125,184,0.08)] font-semibold text-[color:var(--primary)]"
                        : "border-[color:var(--border-light)] bg-card hover:bg-secondary"
                    }`}
                  >
                    <Star className="h-3 w-3" aria-hidden /> {t.name}
                    <span className="text-[color:var(--text-tertiary)]">· {t.visits} visits</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Therapist picker */}
          <div className="space-y-1.5">
            <Label>Therapist</Label>
            <Select value={therapistId} onValueChange={setTherapistId}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {therapists.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.department ? `· ${t.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* "Add to plan?" prompt */}
          {therapistId && !therapistAlreadyOnPlan ? (
            <div className="rounded-lg border border-[color:var(--border-light)] bg-secondary p-3 text-sm">
              <p className="mb-2 font-medium">
                Add this therapist to {clients.find((c) => c.id === clientId)?.label}&apos;s care plan?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={addAssignmentConfirmed === true ? "default" : "outline"}
                  onClick={() => setAddAssignmentConfirmed(true)}
                >
                  Yes, add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={addAssignmentConfirmed === false ? "default" : "outline"}
                  onClick={() => setAddAssignmentConfirmed(false)}
                >
                  No, just this booking
                </Button>
              </div>
            </div>
          ) : null}

          {/* Service picker — accordion by department */}
          <div className="space-y-1.5">
            <Label>Service</Label>
            <div className="space-y-2">
              {servicesByDepartment.map((dept) => {
                const isOpen = openServiceDept === dept.id;
                return (
                  <div
                    key={dept.id}
                    className="overflow-hidden rounded-lg border border-[color:var(--border-light)]"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenServiceDept(isOpen ? null : dept.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                    >
                      <span aria-hidden className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        ▸
                      </span>
                      <span className="flex-1 font-semibold">{dept.name}</span>
                      <span className="text-[11px] text-[color:var(--text-tertiary)]">
                        {dept.services.length}
                      </span>
                    </button>
                    {isOpen ? (
                      <ul className="divide-y divide-[color:var(--border-light)] bg-card">
                        {dept.services.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setServiceId(s.id)}
                              className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                                serviceId === s.id ? "bg-[rgba(42,125,184,0.06)] font-semibold" : ""
                              }`}
                            >
                              <span>{s.name}</span>
                              <span className="text-xs text-[color:var(--text-tertiary)] tabular-nums">
                                ₹{s.basePrice}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Package consumption prompt */}
          {serviceId && activePackages.length > 0 ? (
            <div className="rounded-lg border border-[color:var(--border-light)] bg-[rgba(42,125,184,0.04)] p-3 text-sm">
              <p className="mb-2 font-medium">
                Use 1 session of this service from an active package?
              </p>
              <div className="space-y-2">
                {activePackages.map((pkg) => {
                  const selected = consumeFromPackageId === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() =>
                        setConsumeFromPackageId((cur) => (cur === pkg.id ? null : pkg.id))
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        selected
                          ? "border-[color:var(--primary)] bg-card font-semibold"
                          : "border-[color:var(--border-light)] bg-card hover:bg-secondary"
                      }`}
                    >
                      <span>
                        {pkg.serviceName ?? "Package"} ·{" "}
                        <span className="tabular-nums">
                          {pkg.completedSessions}/{pkg.totalSessions} used
                        </span>{" "}
                        <span className="text-[color:var(--text-tertiary)]">
                          ({pkg.remainingForService} left of this service)
                        </span>
                      </span>
                      <span className="text-[color:var(--text-tertiary)]">
                        {selected ? "✓ using" : "use 1"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {consumeFromPackageId ? (
                <p className="mt-2 text-[11px] text-[color:var(--text-tertiary)]">
                  On book, the package counter decrements atomically. Booking outside the package
                  leaves it untouched.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-notes">Notes (optional)</Label>
            <Input
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="patient prefers… / first-visit reminder…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Booking…" : "Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventDetailDialog({
  event,
  canEdit,
  onClose,
}: {
  event: AppointmentEvent;
  canEdit: boolean;
  onClose: (refreshed: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelledBy, setCancelledBy] = useState<"PATIENT" | "THERAPIST" | "CLINIC">("PATIENT");

  async function cancel() {
    setPending(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: event.id,
          status: "CANCELLED",
          cancelledBy,
          cancelledReason: reason || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't cancel the appointment." }));
      }
      toast.success("Appointment cancelled");
      onClose(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">{event.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
      <div className="space-y-1 text-sm">
        {/* Signal row — clash and pending-reschedule chips ride above the
          * meta so the FO sees blockers immediately, not buried below. */}
        {event.hasClash || event.pendingReschedule || event.flags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pb-2">
            {event.hasClash ? (
              <span className="chip chip-danger">⚠ Clash with another booking</span>
            ) : null}
            {event.pendingReschedule ? (
              <span className="chip chip-warning">⟲ Pending reschedule request</span>
            ) : null}
            {event.flags.map((f, i) => (
              <span key={i} className="chip" title={f.type}>
                {f.label}
              </span>
            ))}
          </div>
        ) : null}
        <p>
          <span className="text-muted-foreground">Therapist:</span> {event.therapistName}
        </p>
        <p>
          <span className="text-muted-foreground">Service:</span> {event.serviceName}
        </p>
        <p>
          <span className="text-muted-foreground">Time:</span>{" "}
          {new Date(event.start).toLocaleString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          →{" "}
          {new Date(event.end).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <p>
          <span className="text-muted-foreground">Status:</span> {event.status}
        </p>
      </div>
      {canEdit && event.status !== "CANCELLED" ? (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-semibold">Cancel</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Cancelled by</Label>
              <Select
                value={cancelledBy}
                onValueChange={(v) => setCancelledBy(v as typeof cancelledBy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PATIENT">Patient</SelectItem>
                  <SelectItem value="THERAPIST">Therapist</SelectItem>
                  <SelectItem value="CLINIC">Clinic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="optional" />
            </div>
          </div>
        </div>
      ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Close
          </Button>
          {canEdit && event.status !== "CANCELLED" ? (
            <Button variant="destructive" onClick={cancel} disabled={pending}>
              {pending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}
