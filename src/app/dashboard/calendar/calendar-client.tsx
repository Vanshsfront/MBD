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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
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
            <select
              id="therapist-filter"
              value={therapistFilter}
              onChange={(e) => setTherapistFilter(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">All</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

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
              if (status === "CANCELLED" || status === "NO_SHOW") return ["mbd-evt-cancelled"];
              if (status === "COMPLETED") return ["mbd-evt-completed"];
              return ["mbd-evt-confirmed"];
            }}
            eventContent={(arg) => ({
              html: `<div class="text-xs px-1 leading-tight">
  <div class="font-medium truncate">${escapeHtml(arg.event.title)}</div>
  <div class="opacity-80">${escapeHtml(arg.event.extendedProps.therapistName as string ?? "")}</div>
</div>`,
            })}
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
    `}</style>
  );
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
  const [pending, setPending] = useState(false);

  const eligibleTherapists = useMemo(() => {
    if (!clientId) return therapists;
    const c = clients.find((x) => x.id === clientId);
    if (!c || c.therapistIds.length === 0) return therapists;
    const ranked = therapists.filter((t) => c.therapistIds.includes(t.id));
    return ranked.length > 0 ? [...ranked, ...therapists.filter((t) => !ranked.includes(t))] : therapists;
  }, [clientId, clients, therapists]);

  const eligibleServices = useMemo(() => {
    if (!therapistId) return services;
    const t = therapists.find((x) => x.id === therapistId);
    if (!t?.departmentId) return services;
    return services.filter((s) => s.departmentId === t.departmentId);
  }, [therapistId, services, therapists]);

  async function submit() {
    if (!clientId || !therapistId || !serviceId) {
      toast.error("Fill in all fields");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, therapistId, serviceId, startTime: start, endTime: end }),
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
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Therapist</Label>
          <select
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            <option value="">Select…</option>
            {eligibleTherapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.department ? `· ${t.department}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Service</Label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            disabled={!therapistId}
          >
            <option value="">Select…</option>
            {eligibleServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (₹{s.basePrice})
              </option>
            ))}
          </select>
        </div>
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
              <select
                value={cancelledBy}
                onChange={(e) => setCancelledBy(e.target.value as typeof cancelledBy)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="PATIENT">Patient</option>
                <option value="THERAPIST">Therapist</option>
                <option value="CLINIC">Clinic</option>
              </select>
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
