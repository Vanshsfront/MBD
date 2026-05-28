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
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Command } from "cmdk";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECT_NONE } from "@/lib/select-styles";
import { readApiError } from "@/lib/error-messages";
import { readableTextColor } from "@/lib/staff-colors";

// How many therapist colours the legend shows before "Show all".
const LEGEND_COLLAPSED_COUNT = 6;

interface TherapistOption {
  id: string;
  name: string;
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
        // eventClassNames (cancelled = struck-through, completed = faded).
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {canBook
              ? "Drag-create new appointments. Drag to move, click for details."
              : "Read-only view of your day. Use Change requests to propose reschedules."}
          </p>
        </div>
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
      </header>

      {/* Legend so the therapist→colour mapping is readable at a glance.
         Collapsed to a handful by default — the full list is long. */}
      {!isClinicalRole && therapists.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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
              {legendExpanded
                ? "Show less"
                : `Show all (${therapists.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-3 sm:p-4">
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
              const base = ["mbd-evt"];
              if (status === "CANCELLED" || status === "NO_SHOW") return [...base, "mbd-evt-cancelled"];
              if (status === "COMPLETED") return [...base, "mbd-evt-completed"];
              return base;
            }}
            eventContent={renderEventContent}
            eventDidMount={attachHoverTitle}
          />
        </CardContent>
      </Card>

      <CalendarStyles />

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

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
      style={{ backgroundColor: color }}
    />
  );
}

// Patient name (+ service) on the first line, therapist on the second. A ✓
// marks completed appointments. IDs are intentionally not shown here — they
// surface on hover (see attachHoverTitle).
function renderEventContent(arg: EventContentArg) {
  const status = (arg.event.extendedProps.status as string) ?? "CONFIRMED";
  const therapistName = (arg.event.extendedProps.therapistName as string) ?? "";
  const tick = status === "COMPLETED" ? "✓ " : "";
  return {
    html: `<div class="mbd-evt-body">
  <div class="mbd-evt-title">${tick}${escapeHtml(arg.event.title)}</div>
  <div class="mbd-evt-sub">${escapeHtml(therapistName)}</div>
</div>`,
  };
}

// Native tooltip on hover reveals the patient code (the "ID") plus context.
function attachHoverTitle(arg: EventMountArg) {
  const code = (arg.event.extendedProps.clientCode as string) ?? "";
  const service = (arg.event.extendedProps.serviceName as string) || "Service TBD";
  const therapist = (arg.event.extendedProps.therapistName as string) ?? "";
  arg.el.setAttribute(
    "title",
    [arg.event.title, code && `ID: ${code}`, `Service: ${service}`, therapist && `Therapist: ${therapist}`]
      .filter(Boolean)
      .join("\n"),
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
      .fc .fc-toolbar.fc-header-toolbar {
        margin-bottom: 1rem;
      }
      .fc .fc-button {
        background: var(--secondary);
        color: var(--secondary-foreground);
        border: 1px solid var(--border);
      }
      .fc .fc-button-primary:not(:disabled).fc-button-active,
      .fc .fc-button-primary:not(:disabled):active {
        background: var(--primary);
        color: var(--primary-foreground);
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
         side-by-side (overlapping) events never blur together. */
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
    `}</style>
  );
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
  const [pending, setPending] = useState(false);

  // Therapists grouped by department, with the patient's already-assigned
  // therapist(s) surfaced in an "Assigned" group at the top.
  const therapistGroups = useMemo(() => {
    const assignedIds = clientId
      ? clients.find((c) => c.id === clientId)?.therapistIds ?? []
      : [];
    const assigned = therapists.filter((t) => assignedIds.includes(t.id));
    const rest = therapists.filter((t) => !assignedIds.includes(t.id));
    const byDept = new Map<string, TherapistOption[]>();
    for (const t of rest) {
      const key = t.department ?? "Other";
      const list = byDept.get(key);
      if (list) list.push(t);
      else byDept.set(key, [t]);
    }
    const deptGroups = [...byDept.entries()].sort(([a], [b]) => a.localeCompare(b));
    return { assigned, deptGroups };
  }, [clientId, clients, therapists]);

  const eligibleServices = useMemo(() => {
    if (!therapistId) return services;
    const t = therapists.find((x) => x.id === therapistId);
    if (!t?.departmentId) return services;
    return services.filter((s) => s.departmentId === t.departmentId);
  }, [therapistId, services, therapists]);

  async function submit() {
    if (!clientId || !therapistId) {
      toast.error("Pick a patient and a therapist");
      return;
    }
    if (canAssignService && !serviceId) {
      toast.error("Select a service");
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
          startTime: start,
          endTime: end,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't book the appointment." }));
      }
      const data = (await res.json().catch(() => ({}))) as { warning?: string };
      toast.success("Appointment booked");
      if (data.warning) toast.warning(data.warning);
      onClose(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Book failed");
    } finally {
      setPending(false);
    }
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {startDate.toLocaleString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            →{" "}
            {endDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient</Label>
              <PatientCombobox clients={clients} value={clientId} onChange={setClientId} />
            </div>
            <div className="space-y-1.5">
              <Label>Therapist</Label>
              {/* Changing therapist clears any service from the old department. */}
              <Select
                value={therapistId}
                onValueChange={(v) => {
                  setTherapistId(v);
                  setServiceId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {therapistGroups.assigned.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>Assigned</SelectLabel>
                      {therapistGroups.assigned.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <ColorDot color={t.color} />
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {therapistGroups.deptGroups.map(([dept, list]) => (
                    <SelectGroup key={dept}>
                      <SelectLabel>{dept}</SelectLabel>
                      {list.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <ColorDot color={t.color} />
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canAssignService ? (
              <div className="space-y-1.5">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={setServiceId} disabled={!therapistId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleServices.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} (₹{s.basePrice})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="rounded-md border border-[color:var(--border-light)] bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                The assigned therapist will set the service for this appointment.
              </p>
            )}
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

// Searchable patient picker. Shows names only; the patient code + phone are
// searchable and surface on hover (title attribute) but never clutter the list.
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
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none aria-selected:bg-secondary"
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${value === c.id ? "opacity-100" : "opacity-0"}`}
                />
                <span className="truncate">{c.name}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
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
          <DialogTitle className="flex items-center gap-2 pr-6">
            <ColorDot color={event.therapistColor} />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            {event.clientCode ? (
              <p>
                <span className="text-muted-foreground">Patient ID:</span> {event.clientCode}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Therapist:</span> {event.therapistName}
            </p>
            <p>
              <span className="text-muted-foreground">Service:</span>{" "}
              {event.serviceName || "Service TBD"}
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
