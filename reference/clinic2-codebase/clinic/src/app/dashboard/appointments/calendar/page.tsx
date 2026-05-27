"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useSession } from "next-auth/react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Plus, Clock, AlertTriangle,
  Calendar as CalendarIcon, Loader2, Flag, CheckCircle2,
  Check, ChevronsUpDown, Trash2
} from "lucide-react";
import { format, addDays, startOfWeek, isToday } from "date-fns";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { THERAPIST_PALETTE, buildTherapistColorMap } from "@/lib/therapist-colors";

// ── Types ────────────────────────────────────────────────────────────────
interface AppointmentItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
  followUpFlag: boolean;
  followUpNote?: string;
  queuePosition?: number;
  client: { id: string; firstName: string; lastName: string; clientCode: string; phone: string };
  therapist: { id: string; name: string; designation?: string };
  service: { id: string; name: string };
}

interface ClientItem { 
  id: string; 
  clientCode: string; 
  firstName: string; 
  lastName: string; 
  preferredTherapist?: { id: string; name: string } | null; 
  intakeForms?: { selectedServices: string }[];
}
interface StaffItem { id: string; name: string; designation: string | null; role?: string; department?: { name: string } | null; }
interface ServiceItem { id: string; name: string; department: { name: string }; }

// ── Constants ────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM
const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-blue-100 border-blue-300 text-blue-800",
  CHECKED_IN: "bg-green-100 border-green-300 text-green-800",
  IN_PROGRESS: "bg-purple-100 border-purple-300 text-purple-800",
  COMPLETED: "bg-emerald-100 border-emerald-300 text-emerald-800",
  CANCELLED: "bg-red-100 border-red-300 text-red-800",
  NO_SHOW: "bg-amber-100 border-amber-300 text-amber-800",
};

const STATUS_HEX: Record<string, { bg: string, border: string, text: string }> = {
  CONFIRMED: { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" },
  CHECKED_IN: { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  IN_PROGRESS: { bg: "#f3e8ff", border: "#d8b4fe", text: "#6b21a8" },
  COMPLETED: { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" },
  CANCELLED: { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  NO_SHOW: { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
};



export default function CalendarPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";
  const userId = (session?.user as { id?: string })?.id;
  const canEdit = hasPermission(userRole, "appointments:edit");

  // State
  const calendarRef = useRef<FullCalendar>(null);
  const [selectedApt, setSelectedApt] = useState<AppointmentItem | null>(null);
  const [aptActionDialogOpen, setAptActionDialogOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewTitle, setViewTitle] = useState("");
  const [viewMode, setViewMode] = useState<"day" | "week">("week");
  const [selectedTherapist, setSelectedTherapist] = useState("ALL");
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Book form
  const [bookClientId, setBookClientId] = useState("");
  const [bookTherapistId, setBookTherapistId] = useState("");
  const [bookServiceId, setBookServiceId] = useState("");
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [bookStartTime, setBookStartTime] = useState("");
  const [bookEndTime, setBookEndTime] = useState("");
  const [bookNotes, setBookNotes] = useState("");

  // Assigned therapists for the selected patient in booking dialog
  const [bookAssignedTherapists, setBookAssignedTherapists] = useState<string[]>([]);

  // Conflict resolution
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{ message: string; conflicts: { id: string; clientName: string; startTime: string; endTime: string; serviceName: string }[] } | null>(null);
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [backupStart, setBackupStart] = useState("");
  const [backupEnd, setBackupEnd] = useState("");

  // Change request
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [changeRequestApt, setChangeRequestApt] = useState<AppointmentItem | null>(null);
  const [changeRequestType, setChangeRequestType] = useState("RESCHEDULE");
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Session usage popup
  const [usagePopupOpen, setUsagePopupOpen] = useState(false);
  const [usagePopup, setUsagePopup] = useState<{
    clientName: string; completedSessions: number; totalSessions: number;
    remaining: number; validUntil?: string;
  } | null>(null);

  // Check-in payment status popup
  const [checkInPopupOpen, setCheckInPopupOpen] = useState(false);
  const [checkInPopup, setCheckInPopup] = useState<{
    clientName: string;
    hasPackage: boolean;
    completedSessions: number;
    totalSessions: number;
    remaining: number;
    validUntil?: string;
    expiryWarningDays: number;
    outstandingBalance: number;
    packageComplete: boolean;
  } | null>(null);

  // Track the visible date range from FullCalendar (source of truth)
  const [visibleRange, setVisibleRange] = useState({ start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), "yyyy-MM-dd") });

  // Fetch appointments for the visible range
  const therapistFilter = selectedTherapist !== "ALL" ? `&therapistId=${selectedTherapist}` : "";
  const appointmentsUrl = `/api/appointments?dateFrom=${visibleRange.start}&dateTo=${visibleRange.end}${therapistFilter}`;

  const { data: appointments, loading, refetch: refetchAppointments } = useApiCache<AppointmentItem[]>(appointmentsUrl);

  const { data: clientData } = useApiCache<{ clients: ClientItem[] }>("/api/clients");
  const { data: therapists } = useApiCache<StaffItem[]>("/api/staff");
  const { data: services } = useApiCache<ServiceItem[]>("/api/services");

  const groupedServices = useMemo(() => {
    const groups: Record<string, ServiceItem[]> = {};
    if (services) {
      services.forEach(s => {
        const dept = s.department?.name || "Other";
        if (!groups[dept]) groups[dept] = [];
        groups[dept].push(s);
      });
    }
    return groups;
  }, [services]);

  const clients = clientData?.clients || [];

  // Build therapist → color map
  const therapistColorMap = useMemo(() => {
    return buildTherapistColorMap(therapists || []);
  }, [therapists]);

  const groupedTherapists = useMemo(() => {
    const groups: Record<string, StaffItem[]> = {};
    if (therapists) {
      therapists.forEach(t => {
        if (t.role === "FRONT_OFFICE" || t.role === "DEV") return;
        const desig = t.department?.name || t.designation || "Other";
        if (!groups[desig]) groups[desig] = [];
        groups[desig].push(t);
      });
    }
    return groups;
  }, [therapists]);

  // Fetch assigned therapists when booking client changes
  useEffect(() => {
    if (!bookClientId) {
      setBookAssignedTherapists([]);
      return;
    }
    fetch(`/api/clients/${bookClientId}`)
      .then(r => r.json())
      .then(data => {
        const ids: string[] = [];
        if (data?.doctorAssignments?.length > 0) {
          data.doctorAssignments.forEach((a: { staff: { id: string } }) => {
            if (!ids.includes(a.staff.id)) ids.push(a.staff.id);
          });
        }
        if (data?.preferredTherapist?.id && !ids.includes(data.preferredTherapist.id)) {
          ids.push(data.preferredTherapist.id);
        }
        setBookAssignedTherapists(ids);
      })
      .catch(() => setBookAssignedTherapists([]));
  }, [bookClientId]);

  // For clinical roles, auto-filter to own appointments
  useEffect(() => {
    if (isClinicalRole(userRole) && userId && selectedTherapist === "ALL") {
      setSelectedTherapist(userId);
    }
  }, [userRole, userId, selectedTherapist]);

  // Therapist display name for the filter
  const therapistDisplayName = useMemo(() => {
    if (selectedTherapist === "ALL") return "All Therapists";
    const t = therapists?.find(t => t.id === selectedTherapist);
    return t?.name || "Therapist";
  }, [selectedTherapist, therapists]);

  // Navigation — drive FullCalendar API, let datesSet sync back
  const goToday = () => {
    calendarRef.current?.getApi().today();
    setCurrentDate(new Date());
  };
  const goPrev = () => calendarRef.current?.getApi().prev();
  const goNext = () => calendarRef.current?.getApi().next();

  const handleViewChange = (mode: "day" | "week") => {
    setViewMode(mode);
    const api = calendarRef.current?.getApi();
    if (api) api.changeView(mode === "day" ? "timeGridDay" : "timeGridWeek");
  };

  // Handle booking
  const handleBook = async () => {
    if (!bookClientId || !bookTherapistId || !bookServiceId || !bookStartTime || !bookEndTime) {
      toast.error("Please fill all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: bookClientId,
          therapistId: bookTherapistId,
          serviceId: bookServiceId,
          startTime: bookStartTime,
          endTime: bookEndTime,
          notes: bookNotes,
          performedById: userId,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setConflictData({ message: data.message, conflicts: data.conflicts || [] });
        setConflictDialogOpen(true);
        return;
      }

      if (!res.ok) throw new Error("Failed");

      toast.success("Appointment booked!");
      setBookDialogOpen(false);
      resetBookForm();
      invalidateCache("/api/appointments");
      refetchAppointments();
    } catch {
      toast.error("Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  };

  const resetBookForm = () => {
    setBookClientId(""); setBookTherapistId(""); setBookServiceId("");
    setBookStartTime(""); setBookEndTime(""); setBookNotes("");
  };

  // Force-replace conflicting appointment
  const handleForceBook = async () => {
    setConflictDialogOpen(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: bookClientId,
          therapistId: bookTherapistId,
          serviceId: bookServiceId,
          startTime: bookStartTime,
          endTime: bookEndTime,
          notes: bookNotes,
          performedById: userId,
          force: true,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Appointment booked — conflicting appointment cancelled");
      setBookDialogOpen(false);
      resetBookForm();
      invalidateCache("/api/appointments");
      refetchAppointments();
    } catch {
      toast.error("Failed to replace appointment");
    } finally {
      setSubmitting(false);
    }
  };

  // Queue booking with backup time
  const handleQueueBook = async () => {
    if (!backupStart || !backupEnd) {
      toast.error("Please select a backup time slot");
      return;
    }
    setQueueDialogOpen(false);
    setConflictDialogOpen(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: bookClientId,
          therapistId: bookTherapistId,
          serviceId: bookServiceId,
          startTime: bookStartTime,
          endTime: bookEndTime,
          notes: bookNotes,
          performedById: userId,
          queuePosition: 1,
          backupStartTime: backupStart,
          backupEndTime: backupEnd,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Added to queue — you'll be notified if the slot opens");
      setBookDialogOpen(false);
      resetBookForm();
      setBackupStart("");
      setBackupEnd("");
      invalidateCache("/api/appointments");
      refetchAppointments();
    } catch {
      toast.error("Failed to add to queue");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle change request
  const handleChangeRequest = async () => {
    if (!changeRequestApt || !changeRequestReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    setSubmittingRequest(true);
    try {
      const res = await fetch("/api/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: changeRequestApt.id,
          requestType: changeRequestType,
          reason: changeRequestReason,
          requestedById: userId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Change request submitted");
      setChangeRequestOpen(false);
      setChangeRequestReason("");
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Cancellation dialog state — asks who cancelled
  const [cancelDialogApt, setCancelDialogApt] = useState<AppointmentItem | null>(null);
  const [cancelledBy, setCancelledBy] = useState<"PATIENT" | "THERAPIST">("PATIENT");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const submitCancellation = async () => {
    if (!cancelDialogApt) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/appointments/${cancelDialogApt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CANCELLED",
          performedById: userId,
          cancelledBy,
          cancelledReason: cancelReason || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Appointment cancelled (by ${cancelledBy.toLowerCase()})`);
      invalidateCache("/api/appointments");
      refetchAppointments();
      setCancelDialogApt(null);
      setCancelledBy("PATIENT");
      setCancelReason("");
    } catch {
      toast.error("Failed to cancel appointment");
    } finally {
      setCancelling(false);
    }
  };

  // Handle status update
  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, performedById: userId }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Status updated to ${status}`);
      invalidateCache("/api/appointments");
      refetchAppointments();

      // Show check-in payment status popup
      if (status === "CHECKED_IN") {
        const apt = appointments?.find(a => a.id === id);
        if (apt) {
          try {
            const clientRes = await fetch(`/api/clients/${apt.client.id}`);
            const clientData = await clientRes.json();
            const activePkg = clientData.packages?.find((p: { status: string }) => p.status === "ACTIVE");

            // Calculate outstanding invoice balance
            const invoices = clientData.invoices || [];
            const outstandingBalance = invoices
              .filter((inv: { status: string }) => inv.status !== "PAID" && inv.status !== "DRAFT")
              .reduce((sum: number, inv: { totalAmount: number; paidAmount: number }) => sum + (inv.totalAmount - inv.paidAmount), 0);

            if (activePkg) {
              const remaining = activePkg.totalSessions - activePkg.completedSessions;
              setCheckInPopup({
                clientName: `${apt.client.firstName} ${apt.client.lastName}`,
                hasPackage: true,
                completedSessions: activePkg.completedSessions,
                totalSessions: activePkg.totalSessions,
                remaining,
                validUntil: activePkg.validUntil,
                expiryWarningDays: activePkg.expiryWarningDays || 14,
                outstandingBalance,
                packageComplete: remaining <= 0,
              });
            } else {
              setCheckInPopup({
                clientName: `${apt.client.firstName} ${apt.client.lastName}`,
                hasPackage: false,
                completedSessions: 0,
                totalSessions: 0,
                remaining: 0,
                expiryWarningDays: 14,
                outstandingBalance,
                packageComplete: false,
              });
            }
            setCheckInPopupOpen(true);
          } catch { /* silently fail */ }
        }
      }

      // Show session usage popup when completing
      if (status === "COMPLETED") {
        const apt = appointments?.find(a => a.id === id);
        if (apt) {
          try {
            const clientRes = await fetch(`/api/clients/${apt.client.id}`);
            const clientData = await clientRes.json();
            const activePkg = clientData.packages?.find((p: { status: string }) => p.status === "ACTIVE");
            if (activePkg) {
              setUsagePopup({
                clientName: `${apt.client.firstName} ${apt.client.lastName}`,
                completedSessions: activePkg.completedSessions,
                totalSessions: activePkg.totalSessions,
                remaining: activePkg.totalSessions - activePkg.completedSessions,
                validUntil: activePkg.validUntil,
              });
              setUsagePopupOpen(true);
            }
          } catch { /* silently fail */ }
        }
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4 pb-12 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-blue-600" />
            Appointment Calendar
          </h1>
          <p className="text-sm text-text-tertiary">
            {isClinicalRole(userRole) && !canEdit ? "View your schedule" : "Schedule and manage appointments"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Therapist filter */}
          <Popover>
            <PopoverTrigger className="flex items-center justify-between rounded-md border border-border-light bg-surface px-3 py-2 h-9 text-sm hover:bg-surface-secondary w-48">
              <span className="truncate">{therapistDisplayName}</span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0 bg-surface border-border-light">
              <Command>
                <CommandInput placeholder="Search..." />
                <CommandEmpty>No therapist found.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    <CommandItem value="All Therapists" onSelect={() => setSelectedTherapist("ALL")}>
                      <Check className={cn("mr-2 h-4 w-4", selectedTherapist === "ALL" ? "opacity-100" : "opacity-0")} />
                      All Therapists
                    </CommandItem>
                    {therapists?.map(t => (
                      <CommandItem key={t.id} value={t.name} onSelect={() => setSelectedTherapist(t.id)}>
                        <Check className={cn("mr-2 h-4 w-4", selectedTherapist === t.id ? "opacity-100" : "opacity-0")} />
                        {t.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {canEdit && (
            <Button onClick={() => setBookDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm px-4">
              <Plus className="h-4 w-4 mr-1" /> Book
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between neumorphic-card-sm p-3 gap-y-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="outline" size="sm" onClick={goPrev} className="h-8 w-8 p-0 border-border-light shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-2 sm:px-3 text-xs border-border-light shrink-0">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            handleViewChange("week");
            goToday();
          }} className="h-8 px-2 sm:px-3 text-xs border-border-light shrink-0">
            This Week
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} className="h-8 w-8 p-0 border-border-light shrink-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Popover>
            <PopoverTrigger className="inline-flex h-8 px-2 ml-1 items-center justify-center rounded-md text-sm sm:text-base font-bold text-text-primary hover:bg-surface-secondary shrink-0 transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50">
              <span className="hidden sm:inline">{viewTitle || format(currentDate, "MMMM d, yyyy")}</span>
              <span className="sm:hidden">{viewTitle || format(currentDate, "MMM dd, yyyy")}</span>
              <CalendarIcon className="h-4 w-4 ml-2 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={currentDate}
                onSelect={(date: Date | undefined) => {
                  if (date) {
                    calendarRef.current?.getApi().gotoDate(date);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          {isToday(currentDate) && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] hidden md:inline-flex shrink-0">TODAY</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5">
          <button
            onClick={() => handleViewChange("day")}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === "day" ? "bg-surface text-text-primary shadow-sm" : "text-text-tertiary"}`}
          >
            Day
          </button>
          <button
            onClick={() => handleViewChange("week")}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === "week" ? "bg-surface text-text-primary shadow-sm" : "text-text-tertiary"}`}
          >
            Week
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="neumorphic-card overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 z-50 bg-surface/50 flex items-center justify-center pointer-events-none">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}
        <style>{`
          /* Google Calendar-like styling */
          .fc { font-family: inherit !important; }
          .fc .fc-col-header-cell { background: var(--surface-secondary); border-color: var(--border-light) !important; }
          .fc .fc-col-header-cell-cushion { padding: 8px 4px; font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
          .fc .fc-timegrid-axis-cushion { font-size: 11px; color: var(--text-tertiary); font-weight: 500; }
          .fc .fc-timegrid-slot { height: 48px !important; border-color: var(--border-light) !important; }
          .fc .fc-timegrid-slot-minor { border-top-style: dotted !important; border-color: var(--border-light) !important; }
          .fc .fc-timegrid-divider { display: none; }
          .fc .fc-scrollgrid { border-color: var(--border-light) !important; }
          .fc td, .fc th { border-color: var(--border-light) !important; }
          .fc .fc-day-today { background: rgba(59, 130, 246, 0.04) !important; }
          .fc .fc-v-event { border: none !important; border-radius: 6px !important; cursor: pointer !important; }
          .fc .fc-timegrid-event { margin: 0 2px !important; }
          .fc .fc-event:hover { filter: brightness(0.95); }

          /* Drag-select highlight */
          .fc-highlight {
            background: rgba(59, 130, 246, 0.12) !important;
            border: 2px dashed rgba(59, 130, 246, 0.4) !important;
            border-radius: 6px !important;
          }

          /* Drag mirror (when dragging to create) */
          .fc-timegrid-event.fc-event-mirror {
            background: rgba(59, 130, 246, 0.2) !important;
            border: 2px solid rgba(59, 130, 246, 0.5) !important;
            border-radius: 6px !important;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15) !important;
          }
          .fc-timegrid-event.fc-event-mirror .fc-event-main {
            color: #1e40af !important;
            font-weight: 600 !important;
          }

          /* Now indicator (red line for current time) */
          .fc .fc-timegrid-now-indicator-line { border-color: #ef4444 !important; border-width: 2px !important; }
          .fc .fc-timegrid-now-indicator-arrow { border-color: #ef4444 !important; }

          /* Dragging cursor */
          .fc .fc-event-dragging { opacity: 0.75; cursor: grabbing !important; }
          .fc .fc-event-resizing { opacity: 0.75; }

          /* Resize handle */
          .fc .fc-event-resizer { opacity: 0; transition: opacity 0.15s; }
          .fc .fc-event:hover .fc-event-resizer { opacity: 1; }
          .fc .fc-timegrid-event-harness:hover { z-index: 10 !important; }
        `}</style>
        <div className="p-4" style={{ height: "calc(100vh - 250px)", minHeight: "600px" }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={viewMode === "day" ? "timeGridDay" : "timeGridWeek"}
            initialDate={currentDate}
            headerToolbar={false}
            allDaySlot={false}
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
            slotDuration="00:10:00"
            slotLabelInterval="01:00"
            snapDuration="00:10:00"
            expandRows={true}
            stickyHeaderDates={true}
            nowIndicator={true}
            height="100%"
            editable={canEdit}
            selectable={canEdit}
            selectMirror={true}
            longPressDelay={50}
            dayMaxEvents={true}
            weekends={true}
            firstDay={1}
            datesSet={(dateInfo) => {
              // Sync our state with what FullCalendar is actually showing
              const newStart = format(dateInfo.start, "yyyy-MM-dd");
              const newEnd = format(addDays(dateInfo.end, -1), "yyyy-MM-dd");
              setVisibleRange(prev => {
                if (prev.start === newStart && prev.end === newEnd) return prev;
                return { start: newStart, end: newEnd };
              });
              
              setViewTitle(dateInfo.view.title);
              const currentCalDate = calendarRef.current?.getApi().getDate();
              if (currentCalDate) {
                setCurrentDate(currentCalDate);
              } else {
                setCurrentDate(dateInfo.start);
              }
              
              // Sync viewMode only if FC changed it (e.g. from header)
              const viewType = dateInfo.view.type;
              if (viewType === "timeGridDay" && viewMode !== "day") setViewMode("day");
              if (viewType === "timeGridWeek" && viewMode !== "week") setViewMode("week");
            }}
            unselectAuto={true}
            events={(appointments || []).map(apt => {
              const tColor = therapistColorMap.get(apt.therapist?.id) || { bg: "#f8fafc", border: "#e2e8f0", text: "#0f172a" };
              return {
                id: apt.id,
                title: `${apt.client?.firstName || ""} ${apt.client?.lastName || ""} - ${apt.service?.name || ""}`.trim(),
                start: apt.startTime,
                end: apt.endTime,
                backgroundColor: tColor.bg,
                borderColor: tColor.border,
                textColor: tColor.text,
                extendedProps: { client: apt.client, service: apt.service, therapist: apt.therapist, startTime: apt.startTime, endTime: apt.endTime, status: apt.status, id: apt.id, notes: apt.notes, followUpFlag: apt.followUpFlag, followUpNote: apt.followUpNote, queuePosition: apt.queuePosition }
              }
            })}
            select={(info) => {
              const startIso = format(info.start, "yyyy-MM-dd'T'HH:mm");
              const endIso = format(info.end, "yyyy-MM-dd'T'HH:mm");
              setBookStartTime(startIso);
              setBookEndTime(endIso);
              setBookDialogOpen(true);
            }}
            eventClick={(info) => {
              const props = info.event.extendedProps;
              if (props?.client && props?.service && props?.therapist) {
                setSelectedApt(props as AppointmentItem);
                setAptActionDialogOpen(true);
              }
            }}
            eventDrop={async (info) => {
              const updatedStart = info.event.startStr;
              const updatedEnd = info.event.endStr;
              try {
                const res = await fetch(`/api/appointments/${info.event.id}`, {
                  method: 'PUT',
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ startTime: updatedStart, endTime: updatedEnd, performedById: userId })
                });
                if (!res.ok) throw new Error("Failed to save");
                invalidateCache("/api/appointments");
                refetchAppointments();
                toast.success("Appointment rescheduled");
              } catch {
                info.revert();
                toast.error("Failed to reschedule");
              }
            }}
            eventResize={async (info) => {
              const updatedStart = info.event.startStr;
              const updatedEnd = info.event.endStr;
              try {
                const res = await fetch(`/api/appointments/${info.event.id}`, {
                  method: 'PUT',
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ startTime: updatedStart, endTime: updatedEnd, performedById: userId })
                });
                if (!res.ok) throw new Error("Failed to save");
                invalidateCache("/api/appointments");
                refetchAppointments();
                toast.success("Duration updated");
              } catch {
                info.revert();
                toast.error("Failed to resize segment");
              }
            }}
            eventContent={(eventInfo) => {
              const props = eventInfo.event.extendedProps;
              const clientName = props?.client ? `${props.client.firstName} ${props.client.lastName}` : eventInfo.event.title;
              const serviceName = props?.service?.name || "";
              const therapistName = props?.therapist?.name || "";
              const status = props?.status || "";
              const startStr = eventInfo.event.start ? format(eventInfo.event.start, "HH:mm") : "";
              const endStr = eventInfo.event.end ? format(eventInfo.event.end, "HH:mm") : "";
              const statusBg = STATUS_HEX[status];
              return (
                <div className="w-full h-full p-1.5 border-box flex flex-col justify-start leading-tight overflow-hidden cursor-pointer" style={{ backgroundColor: eventInfo.event.backgroundColor, color: eventInfo.event.textColor, borderLeft: `3px solid ${eventInfo.event.borderColor}`, borderRadius: 6 }}>
                  <div className="flex items-center gap-1">
                    <p className="font-bold text-[11px] truncate flex-1">{clientName}</p>
                    {statusBg && <span className="shrink-0 text-[7px] font-bold uppercase px-1 py-0.5 rounded" style={{ backgroundColor: statusBg.bg, color: statusBg.text, border: `1px solid ${statusBg.border}` }}>{status.replace("_", " ")}</span>}
                  </div>
                  {startStr && <p className="font-medium text-[10px] opacity-90 truncate mt-0.5">{startStr} – {endStr}</p>}
                  {therapistName && <p className="font-semibold text-[9px] opacity-80 truncate">{therapistName}</p>}
                  {serviceName && <p className="opacity-60 text-[9px] truncate">{serviceName}</p>}
                </div>
              )
            }}
          />
        </div>
      </div>

      {/* Therapist Color Legend */}
      {therapists && therapists.length > 0 && (
        <div className="neumorphic-card-sm p-4">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3">Therapist Legend</h3>
          <div className="flex flex-wrap gap-2">
            {therapists.map(t => {
              const c = therapistColorMap.get(t.id);
              return c ? (
                <div key={t.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold" style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}>
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.border }} />
                  {t.name}
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Queue Summary */}
      {appointments && appointments.length > 0 && (
        <div className="neumorphic-card-sm p-4">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            Today&apos;s Queue ({appointments.length} appointments)
          </h3>
          <div className="flex flex-wrap gap-2">
            {appointments.map((apt, i) => (
              <div key={apt.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${STATUS_COLORS[apt.status]}`}>
                <span className="font-bold">#{i + 1}</span>
                {apt.client.firstName} {apt.client.lastName}
                <span className="opacity-60">{format(new Date(apt.startTime), "HH:mm")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Appointment Details Dialog */}
      <Dialog open={aptActionDialogOpen} onOpenChange={setAptActionDialogOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="bg-surface-secondary border-b border-border-light p-5">
            <DialogTitle className="text-text-primary text-base font-bold flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-blue-600" /> Appointment Details
            </DialogTitle>
          </div>
          {selectedApt && (
            <div className="p-5 space-y-4">
              {/* Patient + therapist with hyperlinks */}
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Patient</p>
                  <Link href={`/dashboard/patients/${selectedApt.client.id}`} className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1">
                    {selectedApt.client.firstName} {selectedApt.client.lastName}
                    <ChevronsUpDown className="h-3 w-3 rotate-45" />
                  </Link>
                  <p className="text-[10px] font-mono text-text-tertiary mt-0.5">{selectedApt.client.clientCode} · +91 {selectedApt.client.phone}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Therapist</p>
                    <p className="text-sm font-semibold text-text-primary">{selectedApt.therapist.name}</p>
                    {selectedApt.therapist.designation && (
                      <p className="text-[10px] text-text-tertiary">{selectedApt.therapist.designation}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Service</p>
                    <p className="text-sm font-semibold text-text-primary">{selectedApt.service.name}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">When</p>
                  <p className="text-sm font-medium text-text-primary">{format(new Date(selectedApt.startTime), "EEE, dd MMM yyyy")}</p>
                  <p className="text-xs text-text-secondary">{format(new Date(selectedApt.startTime), "h:mm a")} — {format(new Date(selectedApt.endTime), "h:mm a")}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Status</p>
                  <Badge className={`${STATUS_COLORS[selectedApt.status] || ""} text-[10px] font-bold`}>{selectedApt.status}</Badge>
                </div>
                {selectedApt.notes && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Notes</p>
                    <p className="text-xs text-text-secondary whitespace-pre-wrap">{selectedApt.notes}</p>
                  </div>
                )}
                <div className="pt-1">
                  <Link href={`/dashboard/patients/${selectedApt.client.id}/clinical-record`} className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                    Open full clinical record →
                  </Link>
                </div>
              </div>

              {canEdit && (
                <div className="space-y-2 pt-2 border-t border-border-light">
                  <div className="grid grid-cols-2 gap-2">
                    {selectedApt.status === "CONFIRMED" && (
                      <Button variant="outline" onClick={() => { updateStatus(selectedApt.id, "CHECKED_IN"); setAptActionDialogOpen(false); }} className="w-full text-green-700 hover:bg-green-100 border-border-light">
                        Check In
                      </Button>
                    )}
                    {selectedApt.status === "CHECKED_IN" && (
                      <Button variant="outline" onClick={() => { updateStatus(selectedApt.id, "COMPLETED"); setAptActionDialogOpen(false); }} className="w-full text-emerald-700 hover:bg-emerald-100 border-border-light">
                        Complete
                      </Button>
                    )}
                    {(selectedApt.status === "CONFIRMED" || selectedApt.status === "CHECKED_IN") && (
                      <Button variant="outline" onClick={() => { updateStatus(selectedApt.id, "NO_SHOW"); setAptActionDialogOpen(false); }} className="w-full text-amber-700 hover:bg-amber-100 border-border-light">
                        No Show
                      </Button>
                    )}
                    {(selectedApt.status === "CONFIRMED" || selectedApt.status === "CHECKED_IN") && (
                      <Button variant="outline" onClick={() => { setCancelDialogApt(selectedApt); setAptActionDialogOpen(false); }} className="w-full text-red-700 hover:bg-red-100 border-border-light">
                        Cancel
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/appointments/${selectedApt.id}?performedById=${userId}`, { method: "DELETE" });
                        if (!res.ok) throw new Error("Failed");
                        toast.success("Appointment deleted");
                        invalidateCache("/api/appointments");
                        refetchAppointments();
                        setAptActionDialogOpen(false);
                        setSelectedApt(null);
                      } catch {
                        toast.error("Failed to delete appointment");
                      }
                    }}
                    className="w-full text-red-600 hover:bg-red-50 border-red-200 hover:border-red-300"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Appointment
                  </Button>
                </div>
              )}
              {!canEdit && hasPermission(userRole, "appointments:request_change") && (selectedApt.status === "CONFIRMED" || selectedApt.status === "CHECKED_IN") && (
                <div className="pt-2 border-t border-border-light">
                  <Button variant="outline" onClick={() => {
                    setChangeRequestApt(selectedApt);
                    setChangeRequestOpen(true);
                    setAptActionDialogOpen(false);
                  }} className="w-full text-blue-700 hover:bg-blue-100 border-border-light">
                    Request Change
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Book Dialog */}
      <Dialog open={bookDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // Clear blue drag-selection highlight when dialog closes
          calendarRef.current?.getApi().unselect();
          resetBookForm();
        }
        setBookDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-lg bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="bg-surface-secondary border-b border-border-light p-5">
            <DialogTitle className="text-text-primary text-base font-bold flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-blue-600" /> Book Appointment
            </DialogTitle>
            <p className="text-xs text-text-tertiary mt-0.5">Schedule a new appointment with conflict detection</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Patient *</Label>
                <Popover>
                  <PopoverTrigger className={cn("flex w-full items-center justify-between rounded-md border border-border-light bg-surface px-3 py-2 h-9 text-sm text-left hover:bg-surface-secondary", !bookClientId && "text-text-tertiary")}>
                    {bookClientId ? clients.find((c) => c.id === bookClientId)?.firstName + " " + clients.find((c) => c.id === bookClientId)?.lastName : "Select patient..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 bg-surface border-border-light">
                    <Command>
                      <CommandInput placeholder="Search patient..." />
                      <CommandEmpty>No patient found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          {clients.map((c) => (
                            <CommandItem key={c.id} value={`${c.firstName} ${c.lastName}`} onSelect={() => {
                              setBookClientId(c.id);
                              if (c.preferredTherapist) setBookTherapistId(c.preferredTherapist.id);
                              if (c.intakeForms?.[0]?.selectedServices) {
                                try {
                                  const parsed = JSON.parse(c.intakeForms[0].selectedServices);
                                  if (parsed && parsed.length > 0) {
                                    const s = services?.find(srv => srv.name === parsed[0]);
                                    if (s) setBookServiceId(s.id);
                                    else if (services && services.length) setBookServiceId(services[0].id);
                                  }
                                } catch (e) {}
                              } else if (services && services.length) {
                                setBookServiceId(services[0].id);
                              }
                            }}>
                              <Check className={cn("mr-2 h-4 w-4", bookClientId === c.id ? "opacity-100" : "opacity-0")} />
                              {c.firstName} {c.lastName}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Therapist *</Label>
                <Popover>
                  <PopoverTrigger className={cn("flex w-full items-center justify-between rounded-md border border-border-light bg-surface px-3 py-2 h-9 text-sm text-left hover:bg-surface-secondary", !bookTherapistId && "text-text-tertiary")}>
                    {bookTherapistId ? therapists?.find((t) => t.id === bookTherapistId)?.name : "Select therapist..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 bg-surface border-border-light">
                    <Command>
                      <CommandInput placeholder="Search therapist..." />
                      <CommandEmpty>No therapist found.</CommandEmpty>
                      <CommandList>
                        {/* Assigned therapists group — shown first when patient selected */}
                        {bookAssignedTherapists.length > 0 && (
                          <CommandGroup heading="Assigned to Patient">
                            {therapists?.filter(t => bookAssignedTherapists.includes(t.id)).map((t) => {
                              const tColor = therapistColorMap.get(t.id);
                              return (
                                <CommandItem key={`assigned-${t.id}`} value={t.name} onSelect={() => setBookTherapistId(t.id)} className="py-2">
                                  <Check className={cn("mr-2 h-4 w-4", bookTherapistId === t.id ? "opacity-100" : "opacity-0")} />
                                  <span className="h-2.5 w-2.5 rounded-full mr-2 shrink-0" style={{ backgroundColor: tColor?.border || "#94a3b8" }} />
                                  <span className="font-semibold">{t.name}</span>
                                  <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">ASSIGNED</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        )}
                        {Object.entries(groupedTherapists)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([desig, ts]) => {
                          const unassignedTs = ts.filter(t => !bookAssignedTherapists.includes(t.id));
                          if (unassignedTs.length === 0) return null;
                          return (
                            <CommandGroup key={desig} heading={desig}>
                              {unassignedTs.map((t) => {
                                const tColor = therapistColorMap.get(t.id);
                                return (
                                  <CommandItem key={t.id} value={t.name} onSelect={() => setBookTherapistId(t.id)}>
                                    <Check className={cn("mr-2 h-4 w-4", bookTherapistId === t.id ? "opacity-100" : "opacity-0")} />
                                    <span className="h-2.5 w-2.5 rounded-full mr-2 shrink-0" style={{ backgroundColor: tColor?.border || "#94a3b8" }} />
                                    {t.name}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          );
                        })}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Service Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Service *</Label>
              <Popover open={serviceSearchOpen} onOpenChange={setServiceSearchOpen}>
                <PopoverTrigger className="flex w-full items-center justify-between rounded-md border border-border-light bg-surface px-3 h-9 text-sm hover:bg-surface-secondary focus:ring-2 focus:ring-blue-500 font-normal overflow-hidden">
                  <span className="truncate text-left flex-1 text-sm">
                    {bookServiceId ? (() => { const s = services?.find(srv => srv.id === bookServiceId); return s ? s.name : "Select service..."; })() : "Select service..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search service..." />
                    <CommandList>
                      <CommandEmpty>No services found.</CommandEmpty>
                      {Object.entries(groupedServices).map(([dept, svcs]) => (
                        <CommandGroup key={dept} heading={dept}>
                          {svcs.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => { setBookServiceId(s.id); setServiceSearchOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4 shrink-0", bookServiceId === s.id ? "opacity-100" : "opacity-0")} />
                              <span className="truncate w-full">{s.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Date *</Label>
                <Input type="date" value={bookStartTime ? bookStartTime.split("T")[0] : ""} onChange={(e) => {
                  const d = e.target.value;
                  const st = bookStartTime ? bookStartTime.split("T")[1] : "09:00";
                  const et = bookEndTime ? bookEndTime.split("T")[1] : "10:00";
                  setBookStartTime(`${d}T${st}`);
                  setBookEndTime(`${d}T${et}`);
                }} className="bg-surface border-border-light h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Start Time *</Label>
                <Input type="time" step="600" value={bookStartTime ? bookStartTime.split("T")[1] : ""} onChange={(e) => {
                  const d = bookStartTime ? bookStartTime.split("T")[0] : new Date().toISOString().split("T")[0];
                  setBookStartTime(`${d}T${e.target.value}`);
                }} className="bg-surface border-border-light h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">End Time *</Label>
                <Input type="time" step="600" value={bookEndTime ? bookEndTime.split("T")[1] : ""} onChange={(e) => {
                  const d = bookEndTime ? bookEndTime.split("T")[0] : bookStartTime ? bookStartTime.split("T")[0] : new Date().toISOString().split("T")[0];
                  setBookEndTime(`${d}T${e.target.value}`);
                }} className="bg-surface border-border-light h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Notes</Label>
              <Textarea value={bookNotes} onChange={e => setBookNotes(e.target.value)} placeholder="Optional notes..." className="bg-surface border-border-light text-sm resize-none min-h-[60px]" />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
              The system will check for scheduling conflicts before confirming.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
              <Button variant="outline" onClick={() => { setBookDialogOpen(false); calendarRef.current?.getApi().unselect(); resetBookForm(); }} className="border-border-light text-sm h-9">Cancel</Button>
              <Button onClick={handleBook} disabled={submitting || !bookClientId || !bookTherapistId || !bookServiceId} className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 px-5">
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Booking...</> : "Confirm Booking"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancellation Dialog — who cancelled? */}
      <Dialog open={!!cancelDialogApt} onOpenChange={v => !v && setCancelDialogApt(null)}>
        <DialogContent className="sm:max-w-sm bg-surface border-border-light shadow-xl">
          <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" /> Cancel Appointment
          </DialogTitle>
          {cancelDialogApt && (
            <div className="space-y-4">
              <p className="text-xs text-text-tertiary">
                {cancelDialogApt.client.firstName} {cancelDialogApt.client.lastName} · {format(new Date(cancelDialogApt.startTime), "EEE dd MMM, h:mm a")}
              </p>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Cancelled by</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCancelledBy("PATIENT")}
                    className={`h-10 rounded-lg border text-sm font-semibold transition-all ${cancelledBy === "PATIENT" ? "bg-red-600 text-white border-red-600" : "bg-surface text-text-secondary border-border-light hover:border-red-300"}`}
                  >
                    Patient
                  </button>
                  <button
                    onClick={() => setCancelledBy("THERAPIST")}
                    className={`h-10 rounded-lg border text-sm font-semibold transition-all ${cancelledBy === "THERAPIST" ? "bg-red-600 text-white border-red-600" : "bg-surface text-text-secondary border-border-light hover:border-red-300"}`}
                  >
                    Therapist
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Reason (optional)</Label>
                <Textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Why is this appointment being cancelled?"
                  className="bg-surface border-border-light text-sm resize-none min-h-[60px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
                <Button variant="outline" onClick={() => setCancelDialogApt(null)} className="border-border-light text-sm h-9">Back</Button>
                <Button onClick={submitCancellation} disabled={cancelling} className="bg-red-600 hover:bg-red-700 text-white text-sm h-9 px-5">
                  {cancelling ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Cancelling...</> : "Confirm Cancellation"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Request Dialog */}
      <Dialog open={changeRequestOpen} onOpenChange={setChangeRequestOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="bg-surface-secondary border-b border-border-light p-5">
            <DialogTitle className="text-base font-bold text-text-primary">Request Appointment Change</DialogTitle>
            <p className="text-xs text-text-tertiary mt-0.5">
              {changeRequestApt && `${changeRequestApt.client.firstName} ${changeRequestApt.client.lastName} · ${changeRequestApt.service.name}`}
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Request Type</Label>
              <Select value={changeRequestType} onValueChange={v => v && setChangeRequestType(v)}>
                <SelectTrigger className="bg-surface border-border-light h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-surface border-border-light">
                  <SelectItem value="RESCHEDULE">Reschedule</SelectItem>
                  <SelectItem value="REASSIGN">Reassign to another therapist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Reason *</Label>
              <Textarea
                value={changeRequestReason}
                onChange={e => setChangeRequestReason(e.target.value)}
                placeholder="Why do you need this change?"
                className="bg-surface border-border-light text-sm resize-none min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
              <Button variant="outline" onClick={() => setChangeRequestOpen(false)} className="border-border-light text-sm h-9">Cancel</Button>
              <Button onClick={handleChangeRequest} disabled={submittingRequest} className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 px-5">
                {submittingRequest ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting...</> : "Submit Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Check-In Payment Status Popup */}
      <Dialog open={checkInPopupOpen} onOpenChange={setCheckInPopupOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-2xl p-0 overflow-hidden">
          {checkInPopup && (() => {
            const { hasPackage, completedSessions, totalSessions, remaining, validUntil, expiryWarningDays, outstandingBalance, packageComplete, clientName } = checkInPopup;

            // Color coding: green >50% remaining, yellow <=50%, red <=20% or complete
            const remainingPct = hasPackage && totalSessions > 0 ? (remaining / totalSessions) * 100 : 0;
            const sessionColor = !hasPackage ? "slate" : packageComplete ? "red" : remainingPct <= 20 ? "red" : remainingPct <= 50 ? "yellow" : "green";
            const usedPct = hasPackage && totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

            // Expiry warning check
            const expiryWarning = validUntil ? (() => {
              const now = new Date();
              const expiry = new Date(validUntil);
              const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              return daysUntilExpiry <= expiryWarningDays ? daysUntilExpiry : null;
            })() : null;

            const headerBg = packageComplete || outstandingBalance > 0 ? "bg-red-50" : sessionColor === "yellow" ? "bg-amber-50" : sessionColor === "red" ? "bg-red-50" : "bg-green-50";
            const headerText = packageComplete || outstandingBalance > 0 ? "text-red-800" : sessionColor === "yellow" ? "text-amber-800" : sessionColor === "red" ? "text-red-800" : "text-green-800";

            return (
              <div className="text-center">
                <div className={`p-6 ${headerBg}`}>
                  <DialogTitle className={`text-lg font-bold ${headerText}`}>
                    Check-In: Payment Status
                  </DialogTitle>
                  <p className="text-sm text-text-secondary mt-1">{clientName}</p>
                </div>
                <div className="p-6 space-y-5">
                  {/* Session count */}
                  {hasPackage ? (
                    <div>
                      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Session Usage</p>
                      <div className={`text-5xl font-black mb-2 ${
                        sessionColor === "red" ? "text-red-600" : sessionColor === "yellow" ? "text-amber-600" : "text-green-600"
                      }`}>
                        {completedSessions} / {totalSessions}
                      </div>
                      <p className="text-sm text-text-tertiary mb-3">sessions used</p>
                      <div className="w-full h-3 bg-surface-secondary rounded-full overflow-hidden mx-auto max-w-xs">
                        <div className={`h-full rounded-full transition-all ${
                          sessionColor === "red" ? "bg-red-500" : sessionColor === "yellow" ? "bg-amber-500" : "bg-green-500"
                        }`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                      </div>
                      {packageComplete ? (
                        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-red-100 text-red-700">
                          <AlertTriangle className="h-4 w-4" /> Package complete — please collect renewal payment
                        </div>
                      ) : (
                        <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                          sessionColor === "red" ? "bg-red-100 text-red-700" : sessionColor === "yellow" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                        }`}>
                          {sessionColor === "green" ? (
                            <><CheckCircle2 className="h-4 w-4" /> {remaining} sessions remaining</>
                          ) : (
                            <><AlertTriangle className="h-4 w-4" /> Only {remaining} session{remaining !== 1 ? "s" : ""} left</>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Package Status</p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-surface-secondary text-text-secondary">
                        No active package
                      </div>
                    </div>
                  )}

                  {/* Outstanding balance */}
                  {outstandingBalance > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Outstanding Balance</p>
                      <p className="text-2xl font-black text-red-600">
                        ₹{outstandingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-red-500 mt-1">Please collect payment before or after the session</p>
                    </div>
                  )}

                  {/* Expiry warning */}
                  {expiryWarning !== null && !packageComplete && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      Package expires {expiryWarning <= 0 ? "today" : `in ${expiryWarning} day${expiryWarning !== 1 ? "s" : ""}`}
                      {validUntil && <span className="text-xs text-amber-600 ml-1">({format(new Date(validUntil), "dd MMM yyyy")})</span>}
                    </div>
                  )}

                  {/* Valid until (if no warning) */}
                  {validUntil && expiryWarning === null && !packageComplete && (
                    <p className="text-xs text-text-tertiary">
                      Package valid until {format(new Date(validUntil), "dd MMM yyyy")}
                    </p>
                  )}
                </div>
                <div className="border-t border-border-light p-4">
                  <Button onClick={() => setCheckInPopupOpen(false)} className="bg-text-primary hover:bg-text-secondary text-white px-8">
                    OK, Got It
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Session Usage Popup */}
      <Dialog open={usagePopupOpen} onOpenChange={setUsagePopupOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-2xl p-0 overflow-hidden">
          {usagePopup && (() => {
            const pct = Math.round((usagePopup.completedSessions / usagePopup.totalSessions) * 100);
            const isOver = usagePopup.remaining <= 0;
            const isLow = usagePopup.remaining <= 2 && usagePopup.remaining > 0;
            const color = isOver ? "red" : isLow ? "red" : "green";
            return (
              <div className="text-center">
                <div className={`p-6 ${color === "red" ? "bg-red-50" : "bg-green-50"}`}>
                  <DialogTitle className={`text-lg font-bold ${color === "red" ? "text-red-800" : "text-green-800"}`}>
                    Session Usage Update
                  </DialogTitle>
                  <p className="text-sm text-text-secondary mt-1">{usagePopup.clientName}</p>
                </div>
                <div className="p-8">
                  <div className={`text-6xl font-black mb-2 ${color === "red" ? "text-red-600" : "text-green-600"}`}>
                    {usagePopup.completedSessions} / {usagePopup.totalSessions}
                  </div>
                  <p className="text-sm text-text-tertiary mb-4">sessions used</p>
                  <div className="w-full h-3 bg-surface-secondary rounded-full overflow-hidden mx-auto max-w-xs">
                    <div className={`h-full rounded-full transition-all ${color === "red" ? "bg-red-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                    color === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {isOver ? (
                      <><AlertTriangle className="h-4 w-4" /> Package exhausted — renew required</>
                    ) : isLow ? (
                      <><AlertTriangle className="h-4 w-4" /> Only {usagePopup.remaining} session{usagePopup.remaining !== 1 ? "s" : ""} left!</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> {usagePopup.remaining} sessions remaining</>
                    )}
                  </div>
                  {usagePopup.validUntil && (
                    <p className="text-xs text-text-tertiary mt-3">
                      Package valid until {format(new Date(usagePopup.validUntil), "dd MMM yyyy")}
                    </p>
                  )}
                </div>
                <div className="border-t border-border-light p-4">
                  <Button onClick={() => setUsagePopupOpen(false)} className="bg-text-primary hover:bg-text-secondary text-white px-8">
                    OK, Got It
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Conflict Resolution Dialog */}
      <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="bg-red-50 border-b border-red-200 p-5">
            <DialogTitle className="text-base font-bold text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Scheduling Conflict
            </DialogTitle>
            <p className="text-xs text-red-600 mt-1">{conflictData?.message}</p>
          </div>
          <div className="p-5 space-y-4">
            {/* Show conflicting appointments */}
            {conflictData?.conflicts && conflictData.conflicts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Conflicts with:</p>
                {conflictData.conflicts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-red-800">{c.clientName}</p>
                      <p className="text-xs text-red-600">
                        {format(new Date(c.startTime), "HH:mm")} – {format(new Date(c.endTime), "HH:mm")}
                        {c.serviceName && <span> · {c.serviceName}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-text-secondary">How would you like to proceed?</p>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4 border-border-light text-left"
                onClick={() => setConflictDialogOpen(false)}
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary">Change Time</p>
                  <p className="text-xs text-text-tertiary">Go back and pick a different time slot</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4 border-red-200 bg-red-50 hover:bg-red-100 text-left"
                onClick={handleForceBook}
                disabled={submitting}
              >
                <div>
                  <p className="text-sm font-semibold text-red-800">Replace Appointment</p>
                  <p className="text-xs text-red-600">Cancel the existing appointment and book this one</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4 border-blue-200 bg-blue-50 hover:bg-blue-100 text-left"
                onClick={() => setQueueDialogOpen(true)}
              >
                <div>
                  <p className="text-sm font-semibold text-blue-800">Add to Queue</p>
                  <p className="text-xs text-blue-600">Queue this patient — they will be notified if the slot opens</p>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Queue Backup Time Dialog */}
      <Dialog open={queueDialogOpen} onOpenChange={setQueueDialogOpen}>
        <DialogContent className="sm:max-w-sm bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="bg-blue-50 border-b border-blue-200 p-5">
            <DialogTitle className="text-base font-bold text-blue-800 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Backup Time Slot
            </DialogTitle>
            <p className="text-xs text-blue-600 mt-1">Choose an alternative time in case the original slot stays taken</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Backup Start Time *</Label>
              <Input
                type="datetime-local"
                value={backupStart}
                onChange={e => setBackupStart(e.target.value)}
                className="bg-surface border-border-light h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Backup End Time *</Label>
              <Input
                type="datetime-local"
                value={backupEnd}
                onChange={e => setBackupEnd(e.target.value)}
                className="bg-surface border-border-light h-9 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
              <Button variant="outline" onClick={() => setQueueDialogOpen(false)} className="border-border-light text-sm h-9">
                Back
              </Button>
              <Button
                onClick={handleQueueBook}
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 px-5"
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Queuing...</> : "Add to Queue"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
