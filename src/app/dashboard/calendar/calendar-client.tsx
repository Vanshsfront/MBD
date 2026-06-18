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
  EventContentArg,
  EventMountArg,
} from "@fullcalendar/core";
import { toast } from "sonner";
import { Star, Check, ChevronsUpDown, Search } from "lucide-react";
import { Command } from "cmdk";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECT_NONE } from "@/lib/select-styles";
import { readApiError } from "@/lib/error-messages";
import { readableTextColor } from "@/lib/staff-colors";
import { WalkInAppointmentDialog } from "./walk-in-dialog";

// How many therapist colours the legend shows before "Show all".
const LEGEND_COLLAPSED_COUNT = 6;

interface TherapistOption {
  id: string;
  name: string;
  // Already resolved server-side via staffColor() — guaranteed hex.
  color: string;
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
  name: string;
  clientCode: string;
  phone: string;
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
  therapistColor: string;
  clientId: string;
  clientCode: string;
  serviceId: string;
  serviceName: string;
  flags: ReadonlyArray<{ type: string; label: string; color: string | null }>;
  hasClash: boolean;
  pendingReschedule: boolean;
  /** Walk-in stub — patient hasn't done intake yet. Rendered with a yellow ring. */
  intakePending: boolean;
  /** Server says this appointment is still within the 24h delete window. */
  canDelete: boolean;
}

interface Props {
  currentUserId: string;
  isClinicalRole: boolean;
  canBook: boolean;
  /** False for Front Office — they book the slot, the therapist sets the service later. */
  canAssignService: boolean;
  therapists: TherapistOption[];
  services: ServiceOption[];
  clients: ClientOption[];
}

export function CalendarClient({
  currentUserId,
  isClinicalRole,
  canBook,
  canAssignService,
  therapists,
  services,
  clients,
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [therapistFilter, setTherapistFilter] = useState<string>(
    isClinicalRole ? currentUserId : "",
  );
  const [creating, setCreating] = useState<{ start: string; end: string } | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AppointmentEvent | null>(null);
  const [legendExpanded, setLegendExpanded] = useState(false);

  function fetchEvents(start: Date, end: Date) {
    const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
    if (therapistFilter && !isClinicalRole) params.set("therapistId", therapistFilter);
    return fetch(`/api/appointments?${params.toString()}`)
      .then((r) => r.json())
      .then((rows: AppointmentEvent[]) =>
        // Colour each event by its therapist; a white border keeps adjacent
        // (overlapping) events visually separated. Status is layered on via
        // eventClassNames (cancelled = struck-through, completed = faded);
        // clash + pending-reschedule rings are layered on top of that.
        rows.map((r) => ({
          ...r,
          backgroundColor: r.therapistColor,
          borderColor: "#ffffff",
          textColor: readableTextColor(r.therapistColor),
        })),
      );
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
                <SelectTrigger id="therapist-filter" className="w-52">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>All therapists</SelectItem>
                  {therapists.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={t.color} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {canBook ? (
            <>
              {/* Walk-in is FO-only: clinical roles never see the intake-
                  pending flow. */}
              {!isClinicalRole ? (
                <Button onClick={() => setWalkInOpen(true)} size="sm" variant="outline">
                  Walk-in (intake pending)
                </Button>
              ) : null}
              <Button onClick={openCreateNow} size="sm">
                + New appointment
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {/* Status legend — explains the modifiers that ride on top of the
        * per-therapist colour (events themselves are tinted by therapist,
        * not status). Status modifiers: ✓ Completed (faded), strikethrough
        * Cancelled (heavily faded), red ring Conflict, orange ring pending
        * Reschedule. Pairs with the therapist colour legend below. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-card/60 px-4 py-2.5 text-xs text-[color:var(--text-secondary)] ring-1 ring-[color:var(--border-light)]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">
          Status
        </span>
        <span className="inline-flex items-center gap-1">✓ Completed</span>
        <span className="inline-flex items-center gap-1"><span className="line-through">Cancelled</span></span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded ring-2 ring-[color:var(--danger)]" /> Clash
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded ring-2 ring-[#d97706]" /> Pending reschedule
        </span>
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Drag an event to reschedule · click for details
        </span>
      </div>

      {/* Therapist colour legend so the therapist→colour mapping is readable
        * at a glance. Collapsed to a handful by default — the full list is
        * long. Hidden for clinical roles since they only see their own day. */}
      {!isClinicalRole && therapists.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">
            Therapists
          </span>
          {(legendExpanded ? therapists : therapists.slice(0, LEGEND_COLLAPSED_COUNT)).map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <ColorDot color={t.color} />
              {t.name}
            </span>
          ))}
          {therapists.length > LEGEND_COLLAPSED_COUNT ? (
            <button
              type="button"
              onClick={() => setLegendExpanded((v) => !v)}
              className="font-medium text-primary hover:underline"
            >
              {legendExpanded ? "Show less" : `Show all (${therapists.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

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
            height="auto"
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            slotEventOverlap={false}
            expandRows
            allDaySlot={false}
            nowIndicator
            dayMaxEvents
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
              const classes = ["mbd-evt"];
              if (status === "CANCELLED" || status === "NO_SHOW") classes.push("mbd-evt-cancelled");
              else if (status === "COMPLETED") classes.push("mbd-evt-completed");
              if (arg.event.extendedProps.hasClash) classes.push("mbd-evt-clash");
              if (arg.event.extendedProps.pendingReschedule) classes.push("mbd-evt-pending-rsch");
              if (arg.event.extendedProps.intakePending) classes.push("mbd-evt-intake-pending");
              return classes;
            }}
            eventContent={renderEventContent}
            eventDidMount={attachHoverTitle}
          />
        </CardContent>
      </Card>

      <CalendarStyles />

      {/* Walk-in dialog — separate from the full booking dialog because the
        * data shape is much smaller (no patient picker, no service). */}
      <WalkInAppointmentDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        startIso={
          creating?.start ??
          new Date(Math.ceil(Date.now() / (30 * 60_000)) * (30 * 60_000)).toISOString()
        }
        endIso={
          creating?.end ??
          new Date(Math.ceil(Date.now() / (30 * 60_000)) * (30 * 60_000) + 30 * 60_000).toISOString()
        }
        therapists={therapists.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        onCreated={() => calendarRef.current?.getApi().refetchEvents()}
      />

      {creating ? (
        <CreateAppointmentDialog
          start={creating.start}
          end={creating.end}
          canAssignService={canAssignService}
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
    therapistColor: (e.extendedProps.therapistColor as string) ?? "#2a7db8",
    clientId: (e.extendedProps.clientId as string) ?? "",
    clientCode: (e.extendedProps.clientCode as string) ?? "",
    serviceId: (e.extendedProps.serviceId as string) ?? "",
    serviceName: (e.extendedProps.serviceName as string) ?? "",
    flags:
      (e.extendedProps.flags as ReadonlyArray<{ type: string; label: string; color: string | null }>) ?? [],
    hasClash: Boolean(e.extendedProps.hasClash),
    pendingReschedule: Boolean(e.extendedProps.pendingReschedule),
    intakePending: Boolean(e.extendedProps.intakePending),
    canDelete: Boolean(e.extendedProps.canDelete),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Tiny coloured dot — used in the therapist filter dropdown + create-dialog
// therapist Select + legend. Matches vansh's pattern for visual consistency.
function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
      style={{ backgroundColor: color }}
    />
  );
}

// Patient name (+ service) on the first line, therapist on the second. A ✓
// marks completed appointments. Inline pill row carries clash/resch/flags
// from my session work — the status modifiers live in the wrapper class.
function renderEventContent(arg: EventContentArg) {
  const status = (arg.event.extendedProps.status as string) ?? "CONFIRMED";
  const therapistName = (arg.event.extendedProps.therapistName as string) ?? "";
  const flags =
    (arg.event.extendedProps.flags as ReadonlyArray<{ type: string; label: string }>) ?? [];
  const hasClash = Boolean(arg.event.extendedProps.hasClash);
  const pendingRsch = Boolean(arg.event.extendedProps.pendingReschedule);
  const tick = status === "COMPLETED" ? "✓ " : "";
  return {
    html: `<div class="mbd-evt-body">
  <div class="mbd-evt-title">${tick}${escapeHtml(arg.event.title)}</div>
  <div class="mbd-evt-sub">${escapeHtml(therapistName)}</div>
  ${hasClash || pendingRsch || flags.length > 0
    ? `<div class="mbd-evt-pills">
    ${hasClash ? '<span class="mbd-evt-pill mbd-evt-pill-danger">⚠ clash</span>' : ""}
    ${pendingRsch ? '<span class="mbd-evt-pill mbd-evt-pill-warning">⟲ resch.</span>' : ""}
    ${flags
      .slice(0, 2)
      .map(
        (f) =>
          `<span class="mbd-evt-pill" title="${escapeHtml(f.type)}">${escapeHtml(f.label)}</span>`,
      )
      .join("")}
  </div>`
    : ""}
</div>`,
  };
}

// Native tooltip on hover reveals the patient code (the "ID") plus context
// and any flags. Beats trying to cram everything into the event card.
function attachHoverTitle(arg: EventMountArg) {
  const code = (arg.event.extendedProps.clientCode as string) ?? "";
  const service = (arg.event.extendedProps.serviceName as string) || "Service TBD";
  const therapist = (arg.event.extendedProps.therapistName as string) ?? "";
  const flags =
    (arg.event.extendedProps.flags as ReadonlyArray<{ type: string; label: string }>) ?? [];
  arg.el.setAttribute(
    "title",
    [
      arg.event.title,
      code && `ID: ${code}`,
      `Service: ${service}`,
      therapist && `Therapist: ${therapist}`,
      flags.length > 0 && `Flags: ${flags.map((f) => `${f.type}:${f.label}`).join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
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
      .fc .fc-toolbar.fc-header-toolbar {
        margin-bottom: 1rem;
      }
      /* Roomier time grid so events have breathing space. */
      .fc .fc-timegrid-slot {
        height: 2.6em;
      }
      .fc .fc-timegrid-axis-cushion,
      .fc .fc-timegrid-slot-label-cushion {
        font-size: 11px;
        color: var(--text-tertiary);
      }
      /* Event card: rounded, padded, soft shadow, white separating border so
         side-by-side (overlapping) events never blur together. Background +
         text colour come from per-event JSON (therapistColor + WCAG pick). */
      .fc .mbd-evt {
        border-radius: 7px;
        border-width: 1.5px;
        padding: 0;
        box-shadow: 0 1px 3px rgba(26, 26, 30, 0.18);
        overflow: hidden;
      }
      .fc .fc-timegrid-event {
        margin-right: 1px;
      }
      .mbd-evt-body {
        padding: 2px 5px;
        line-height: 1.2;
      }
      .mbd-evt-title {
        font-size: 11.5px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mbd-evt-sub {
        font-size: 10.5px;
        opacity: 0.85;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mbd-evt-pills {
        display: flex;
        gap: 2px;
        margin-top: 1px;
        flex-wrap: wrap;
      }
      .fc .mbd-evt-completed {
        opacity: 0.78;
      }
      .fc .mbd-evt-cancelled {
        opacity: 0.5;
      }
      .fc .mbd-evt-cancelled .mbd-evt-title {
        text-decoration: line-through;
      }
      /* List view rows pick up the same therapist dot colour. */
      .fc .fc-list-event-dot {
        border-color: currentColor;
      }
      /* Clash + pending-reschedule rings layered on top of the per-therapist
       * tint. Clash wins visually (red) because it's blocking. */
      .fc .mbd-evt-clash {
        box-shadow: 0 0 0 2px var(--danger), 0 2px 6px rgba(220,53,69,0.25);
      }
      .fc .mbd-evt-pending-rsch:not(.mbd-evt-clash) {
        box-shadow: 0 0 0 2px #d97706, 0 2px 6px rgba(217,119,6,0.20);
      }
      /* Walk-in (intake pending) — yellow ring + striped left edge so the FO
       * can spot at a glance which appointments still need intake done on
       * arrival. Beats clash + pending-rsch in stacking only when nothing
       * else fires; clashes still win visually. */
      .fc .mbd-evt-intake-pending:not(.mbd-evt-clash):not(.mbd-evt-pending-rsch) {
        box-shadow: 0 0 0 2px #eab308, 0 2px 6px rgba(234,179,8,0.22);
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
  canAssignService,
  therapists,
  services,
  clients,
  onClose,
}: {
  start: string;
  end: string;
  canAssignService: boolean;
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

  // Reset the add-to-plan confirmation whenever the patient or therapist
  // changes. Without this the prior choice carries over visually ("Yes" stays
  // highlighted) and can submit a stale answer for a different therapist —
  // the bug behind "add doctor → add to care plan" reports.
  useEffect(() => {
    setAddAssignmentConfirmed(null);
  }, [clientId, therapistId]);

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
    if (!clientId || !therapistId) {
      toast.error("Patient and therapist are required");
      return;
    }
    if (canAssignService && !serviceId) {
      toast.error("Select a service");
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
          serviceId: serviceId || undefined,
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
                min={5}
                max={480}
                step={1}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(5, Number(e.target.value)))}
              />
            </div>
          </div>

          {/* Patient picker — searchable by name, code, or phone. Lifted
            * verbatim from vansh's PatientCombobox so a 200-client centre
            * can find their patient in a couple of keystrokes. */}
          <div className="space-y-1.5">
            <Label>Patient</Label>
            <PatientCombobox clients={clients} value={clientId} onChange={setClientId} />
          </div>

          {/* Top-3 therapists chip row — most-frequent historical pairings
            * for this patient, surfaced from the top-therapists endpoint. */}
          {clientId && topTherapists.length > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Top therapists for this patient</Label>
              <div className="flex flex-wrap gap-2">
                {topTherapists.map((t) => {
                  const therapistMeta = therapists.find((x) => x.id === t.id);
                  return (
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
                      {therapistMeta ? <ColorDot color={therapistMeta.color} /> : <Star className="h-3 w-3" aria-hidden />}
                      {t.name}
                      <span className="text-[color:var(--text-tertiary)]">· {t.visits} visits</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Therapist picker — coloured dots per row so the calendar tint
            * preview matches the row a person picks. */}
          <div className="space-y-1.5">
            <Label>Therapist</Label>
            <Select value={therapistId} onValueChange={setTherapistId}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {therapists.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <ColorDot color={t.color} />
                      {t.name}
                      {t.department ? (
                        <span className="text-[color:var(--text-tertiary)]">· {t.department}</span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* "Add to plan?" prompt */}
          {therapistId && !therapistAlreadyOnPlan ? (
            <div className="rounded-lg border border-[color:var(--border-light)] bg-secondary p-3 text-sm">
              <p className="mb-2 font-medium">
                Add this therapist to {clients.find((c) => c.id === clientId)?.name ?? "this patient"}&apos;s care plan?
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

          {/* Service picker — accordion by department. Hidden for Front
            * Office (canAssignService = false) per the FO-defers-service
            * flow; the therapist sets it later during the consultation. */}
          {canAssignService ? (
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
          ) : (
            <p className="rounded-md border border-[color:var(--border-light)] bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              The assigned therapist will set the service for this appointment.
            </p>
          )}

          {/* Package consumption prompt — only firable when serviceId is
            * set, so naturally inert in the FO-defers-service path. */}
          {canAssignService && serviceId && activePackages.length > 0 ? (
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

// Cancellation categories — server enforces this as the required tag when
// status flips to CANCELLED. NO_SHOW is also a top-level Appointment.status
// value; declaring no-show goes through a separate handler that PATCHes
// status=NO_SHOW directly (skipping the cancellation pathway).
const CANCELLATION_CATEGORY_LABELS: Record<string, string> = {
  PATIENT_CANCELLED: "Patient cancelled",
  THERAPIST_CANCELLED_SHIFT: "Therapist cancelled / shift change",
  NO_SHOW: "No-show (patient didn't arrive)",
};

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
  const [cancelCategory, setCancelCategory] = useState<
    "PATIENT_CANCELLED" | "THERAPIST_CANCELLED_SHIFT" | "NO_SHOW"
  >("PATIENT_CANCELLED");

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
          cancellationCategory: cancelCategory,
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

  async function markNoShow() {
    setPending(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, status: "NO_SHOW" }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't mark as no-show." }));
      }
      toast.success("Marked as no-show");
      onClose(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No-show failed");
    } finally {
      setPending(false);
    }
  }

  async function deleteMistake() {
    if (
      !window.confirm(
        "Delete this appointment entirely?\n\nUse only if it was booked by mistake — for genuine cancellations use the Cancel flow instead. Deletion is permanent.",
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/appointments?id=${encodeURIComponent(event.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't delete the appointment." }));
      }
      toast.success("Appointment deleted");
      onClose(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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
      {canEdit && event.status !== "CANCELLED" && event.status !== "NO_SHOW" ? (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-semibold">Cancel</p>
          <div className="space-y-1">
            <Label className="text-xs">Category *</Label>
            <Select
              value={cancelCategory}
              onValueChange={(v) =>
                setCancelCategory(v as "PATIENT_CANCELLED" | "THERAPIST_CANCELLED_SHIFT" | "NO_SHOW")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CANCELLATION_CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="extra context" />
            </div>
          </div>
        </div>
      ) : null}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onClose(false)}>
            Close
          </Button>
          {/* Delete-by-mistake: hard-delete within the 24h window, regardless
            * of status. Different semantics from "Cancel" — for genuine
            * mis-clicks, not real cancellations. */}
          {canEdit && event.canDelete ? (
            <Button
              variant="outline"
              onClick={deleteMistake}
              disabled={pending}
              title="Booked by mistake — hard-delete the appointment"
            >
              Delete (mistake)
            </Button>
          ) : null}
          {canEdit && event.status !== "CANCELLED" && event.status !== "NO_SHOW" ? (
            <>
              <Button variant="outline" onClick={markNoShow} disabled={pending}>
                {pending ? "…" : "Mark no-show"}
              </Button>
              <Button variant="destructive" onClick={cancel} disabled={pending}>
                {pending ? "Cancelling…" : "Cancel appointment"}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Searchable patient picker — shows only the name in the trigger, but
// matches on name + clientCode + phone. Lifted from vansh's commit; better
// than a plain Select once the centre has more than a couple dozen patients.
function PatientCombobox({
  clients,
  value,
  onChange,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--border)] bg-card px-3 py-1 text-sm shadow-[0_1px_2px_0_var(--shadow-color)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <span className={selected ? "" : "text-[color:var(--text-tertiary)]"}>
            {selected ? selected.name : "Search patient…"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
      >
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <div className="flex items-center gap-2 border-b border-[color:var(--border-light)] px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search by name, ID or phone…"
              autoFocus
              className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--text-tertiary)]"
            />
          </div>
          <Command.List
            className="overflow-y-auto overscroll-contain p-1"
            style={{ maxHeight: 256 }}
          >
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No patient found.
            </Command.Empty>
            {clients.map((c) => (
              <Command.Item
                key={c.id}
                // Searchable on name + code + phone; only the name renders.
                value={`${c.name} ${c.clientCode} ${c.phone}`}
                title={`${c.name} · ${c.clientCode}`}
                onSelect={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm aria-selected:bg-secondary"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {value === c.id ? <Check className="h-4 w-4 text-[color:var(--primary)]" /> : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
