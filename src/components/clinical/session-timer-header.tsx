"use client";

// Live session timer + Begin/End buttons. Sits in the clinical record
// header. Two states:
//
//   1. No active session → "Begin session" button + form-type dropdown.
//      POST /api/sessions/start creates an IN_PROGRESS Session.
//
//   2. Session in progress → ticking elapsed-time clock + "End session"
//      button. PATCH /api/sessions/[id]/end stamps endedAt, computes
//      duration, and (if a Package is linked via the appointment) atomically
//      decrements the package counter.
//
// Server-rendered state is passed in as `initialActive`; after Begin/End
// we router.refresh() so the parent reloads with the new state.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/error-messages";

interface ActiveSession {
  id: string;
  startedAt: string; // ISO
  sessionFormType: string | null;
}

interface LinkedPackage {
  id: string;
  name: string;
  remaining: number;
  totalSessions: number;
}

interface Props {
  clientId: string;
  // The Consultation row currently in the form. Optional — if present and
  // there's an active session, we'll attach it to the Session on End so
  // the sessions list can link to the consultation PDF.
  consultationId?: string | null;
  initialActive: ActiveSession | null;
  // The package this session is linked to (via the nearby appointment).
  // Drives the "Will consume from <Package> — X/Y left" indicator so the
  // therapist sees up-front whether End-session decrements a package.
  initialLinkedPackage?: LinkedPackage | null;
  // Hide entirely for non-clinical roles (FO/OWNER browsing a record).
  canStart: boolean;
}

// Grouped by category for findability — covers every department + modality.
// Keep value strings in sync with SESSION_FORM_TYPES in /api/sessions/start.
interface FormTypeOption {
  value: string;
  label: string;
  group: string;
}
const FORM_TYPE_OPTIONS: ReadonlyArray<FormTypeOption> = [
  // General clinical
  { group: "General", value: "intake", label: "Intake / first visit" },
  { group: "General", value: "followup", label: "Follow-up" },
  { group: "General", value: "reassessment", label: "Re-assessment" },
  { group: "General", value: "consultation", label: "Consultation" },
  { group: "General", value: "fab", label: "Functional assessment (FAB)" },
  // Physiotherapy
  { group: "Physiotherapy", value: "physiotherapy", label: "Physiotherapy session" },
  { group: "Physiotherapy", value: "rehab", label: "Rehabilitation" },
  { group: "Physiotherapy", value: "manual", label: "Manual therapy" },
  { group: "Physiotherapy", value: "needling", label: "Dry needling" },
  { group: "Physiotherapy", value: "cupping", label: "Cupping" },
  { group: "Physiotherapy", value: "iastm", label: "IASTM (instrument-assisted)" },
  { group: "Physiotherapy", value: "taping", label: "Taping" },
  { group: "Physiotherapy", value: "electrotherapy", label: "Electrotherapy / TENS" },
  // Massage
  { group: "Massage", value: "massage", label: "Massage / deep tissue" },
  // Wellness
  { group: "Wellness", value: "yoga", label: "Yoga session" },
  { group: "Wellness", value: "meditation", label: "Meditation / breathwork" },
  // Counselling
  { group: "Counselling", value: "counselling", label: "Counselling session" },
  // Nutrition
  { group: "Nutrition", value: "nutrition", label: "Nutrition consult" },
  // S&C
  { group: "S&C", value: "strength_conditioning", label: "Strength & conditioning" },
  { group: "S&C", value: "training", label: "Training / coaching" },
  // Delivery mode
  { group: "Delivery", value: "home_visit", label: "Home visit" },
  { group: "Delivery", value: "online", label: "Online / tele-session" },
  { group: "Delivery", value: "group", label: "Group class" },
  // Other
  { group: "Other", value: "other", label: "Other" },
];

// Stable ordering of group labels for rendering — keeps the dropdown
// scannable. Order matches the clinic's typical workflow: clinical first,
// then bodywork, then specialties.
const FORM_TYPE_GROUPS: ReadonlyArray<string> = [
  "General",
  "Physiotherapy",
  "Massage",
  "Wellness",
  "Counselling",
  "Nutrition",
  "S&C",
  "Delivery",
  "Other",
];

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SessionTimerHeader({
  clientId,
  consultationId,
  initialActive,
  initialLinkedPackage,
  canStart,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null>(initialActive);
  const [linkedPackage, setLinkedPackage] = useState<LinkedPackage | null>(
    initialLinkedPackage ?? null,
  );
  const [formType, setFormType] = useState<string>(initialActive?.sessionFormType ?? "followup");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick once per second while a session is in progress. Cheap — single
  // setInterval, no per-tick re-render of the form below (the timer is a
  // sibling, not a parent).
  useEffect(() => {
    if (!active) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [active]);

  if (!canStart) return null;

  async function begin() {
    setPending(true);
    try {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, sessionFormType: formType }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't begin the session." }));
      }
      const data = (await res.json()) as {
        session: ActiveSession;
        linkedPackage: LinkedPackage | null;
      };
      setActive(data.session);
      setLinkedPackage(data.linkedPackage ?? null);
      setNow(Date.now());
      toast.success(
        data.linkedPackage
          ? `Session started · will consume from ${data.linkedPackage.name}`
          : "Session started · standalone (no package linked)",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Begin session failed");
    } finally {
      setPending(false);
    }
  }

  async function end() {
    if (!active) return;
    // Optimistic clear — flip the UI to the post-end state BEFORE awaiting
    // the API, so the timer disappears the instant the user clicks. Without
    // this, the End button stays clickable during the in-flight window
    // (disabled={pending} only kicks in after React paints) and fast
    // double-clicks would fire a second request that returns 409.
    const snapActive = active;
    const snapPackage = linkedPackage;
    setPending(true);
    setActive(null);
    setLinkedPackage(null);
    try {
      const res = await fetch(`/api/sessions/${snapActive.id}/end`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consultationId ? { consultationId } : {}),
      });
      if (!res.ok) {
        // 409 = session is already COMPLETED (dual tabs, prior end raced
        // through, etc.). The optimistic clear is correct; sync server data
        // and exit quietly — no error toast, the user did nothing wrong.
        if (res.status === 409) {
          router.refresh();
          return;
        }
        // Any other failure → roll back so the timer + End button reappear.
        setActive(snapActive);
        setLinkedPackage(snapPackage);
        throw new Error(await readApiError(res, { fallback: "Couldn't end the session." }));
      }
      const data = (await res.json()) as { durationMin: number; packageDecremented: boolean };
      toast.success(
        data.packageDecremented
          ? `Session ended (${data.durationMin} min) · 1 session consumed from package`
          : `Session ended · ${data.durationMin} min logged`,
        { duration: 6000 },
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "End session failed");
    } finally {
      setPending(false);
    }
  }

  if (active) {
    const elapsedMs = now - new Date(active.startedAt).getTime();
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--primary)] bg-[rgba(42,125,184,0.06)] px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <span className="dot live" aria-hidden />
            <span className="font-medium">Session in progress</span>
            <span
              className="font-mono text-base font-semibold tabular-nums"
              aria-label="Elapsed time"
            >
              {formatElapsed(elapsedMs)}
            </span>
            {active.sessionFormType ? (
              <span className="chip text-[10px]">{active.sessionFormType}</span>
            ) : null}
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={end}
            disabled={pending}
            className="ml-auto"
          >
            {pending ? "Ending…" : "End session"}
          </Button>
        </div>
        {linkedPackage ? (
          <p className="px-1 text-xs text-muted-foreground">
            On End-session · 1 session will be consumed from{" "}
            <strong className="text-foreground">{linkedPackage.name}</strong> ·{" "}
            {linkedPackage.remaining}/{linkedPackage.totalSessions} sessions left
          </p>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">
            Standalone session — no package linked. Book against a package to consume from one.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--border-light)] bg-card px-4 py-3">
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Session type
        </Label>
        <Select value={formType} onValueChange={setFormType}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[420px]">
            {FORM_TYPE_GROUPS.map((group) => {
              const items = FORM_TYPE_OPTIONS.filter((o) => o.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </div>
                  {items.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </div>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={begin}
        disabled={pending}
        className="ml-auto"
      >
        {pending ? "Starting…" : "Begin session"}
      </Button>
    </div>
  );
}
