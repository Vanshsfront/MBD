"use client";

// Clinical shell — owns the save state machine and dispatches the right
// per-template form. Each per-template form takes (formData, setFormData,
// disabled) and renders its own UI; the shell handles persistence,
// recommendations, locking, and the PDF render link.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocxTemplateKey } from "@/lib/templates/keys";
import { readApiError } from "@/lib/error-messages";
import {
  type RecommendationItem,
  RecommendationPicker,
  Section,
  SessionProtocolField,
  type ServiceOption,
} from "./shared";
import { SectionRail } from "./section-rail";

import { PhysicianConsultationForm } from "./physician-consultation";
import { PhysiotherapyConsultationForm } from "./physiotherapy-consultation";
import { PhysicianFollowupForm } from "./physician-followup";
import { PhysiotherapyFollowupForm } from "./physiotherapy-followup";
import { SCFollowupForm } from "./sc-followup";
import { YogaFollowupForm } from "./yoga-followup";
import { CounsellingFollowupForm } from "./counselling-followup";
import { NutritionFollowupForm } from "./nutrition-followup";
import { YogaIntakeForm } from "./yoga-intake";
import { CounsellingIntakeForm } from "./counselling-intake";
import { FabForm } from "./fab";

interface ConsultationView {
  id: string;
  date: string;
  status: string;
  consultantId: string;
  consultantName: string | null;
  templateKey: string;
  chiefComplaints: string | null;
  diagnosis: string | null;
  recommendedSessions: number | null;
  formData: string | null;
  recommendedServicesJson: string | null;
}

interface Props {
  clientId: string;
  patientName: string;
  templateKey: DocxTemplateKey;
  isFirstVisit: boolean;
  department: string | null;
  currentUserId: string;
  canEditCompleted: boolean;
  viewOnly: boolean;
  consultations: ConsultationView[];
  services: ServiceOption[];
}

const TEMPLATE_LABELS: Record<DocxTemplateKey, string> = {
  "common-intake": "Common patient intake",
  physician: "Physician consultation",
  physiotherapy: "Physiotherapy consultation",
  "physician-followup": "Physician follow-up",
  "physiotherapy-followup": "Physiotherapy follow-up",
  "sc-followup": "S&C follow-up",
  "yoga-followup": "Yoga follow-up",
  "counselling-followup": "Counselling follow-up",
  "nutrition-followup": "Nutrition follow-up",
  "yoga-intake": "Yoga intake",
  "counselling-intake": "Counselling intake",
  fab: "Functional assessment battery",
};

export function ClinicalShell({
  clientId,
  patientName,
  templateKey,
  isFirstVisit,
  department,
  currentUserId,
  canEditCompleted,
  viewOnly,
  consultations,
  services,
}: Props) {
  // Find this user's existing draft for this template (if any). DRAFT only —
  // COMPLETED rows are immutable except for OWNER, who can re-edit; we still
  // load the most-recent COMPLETED here so the form can show context.
  const ownDraft = useMemo(
    () =>
      consultations.find(
        (c) =>
          c.consultantId === currentUserId &&
          c.templateKey === templateKey &&
          c.status === "DRAFT",
      ) ?? null,
    [consultations, currentUserId, templateKey],
  );

  // The "active" record we are editing — own draft if any, otherwise null
  // (Save creates a new one). For OWNER's COMPLETED-edit override, we still
  // start from null and POST a new revision row.
  const [activeId, setActiveId] = useState<string | null>(ownDraft?.id ?? null);
  const [draftStatus, setDraftStatus] = useState<"DRAFT" | "COMPLETED">(
    (ownDraft?.status as "DRAFT" | "COMPLETED" | undefined) ?? "DRAFT",
  );
  const [pending, setPending] = useState(false);

  // Form state — initialised from the ownDraft if it exists.
  const initialFormData: Record<string, unknown> = useMemo(() => {
    if (ownDraft?.formData) {
      try {
        return JSON.parse(ownDraft.formData) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }, [ownDraft]);

  const initialChiefComplaints = ownDraft?.chiefComplaints ?? "";
  const initialDiagnosis = ownDraft?.diagnosis ?? "";
  const initialRecommended: RecommendationItem[] = useMemo(() => {
    if (!ownDraft?.recommendedServicesJson) return [];
    try {
      const arr = JSON.parse(ownDraft.recommendedServicesJson) as unknown[];
      if (!Array.isArray(arr)) return [];
      return arr.filter((it): it is RecommendationItem => {
        return (
          !!it &&
          typeof it === "object" &&
          typeof (it as RecommendationItem).serviceId === "string"
        );
      });
    } catch {
      return [];
    }
  }, [ownDraft]);

  const [formData, setFormData] = useState<Record<string, unknown>>(initialFormData);
  const [chiefComplaints, setChiefComplaints] = useState<string>(initialChiefComplaints);
  const [diagnosis, setDiagnosis] = useState<string>(initialDiagnosis);
  const [planOfCare, setPlanOfCare] = useState<string>(ownDraft ? "" : "");
  const [followUp, setFollowUp] = useState<string>("");
  const [recommended, setRecommended] = useState<RecommendationItem[]>(initialRecommended);
  // Inventory-consumed widget was removed (2026-05-30) — doctor-use inventory
  // is stocked separately from sale stock, so pulling from sale stock on
  // session-save was wrong. Logged usage remains in InventoryLog from prior
  // sessions; no further writes happen from this surface.

  const isLocked = draftStatus === "COMPLETED" && !canEditCompleted;
  const disabled = isLocked || viewOnly;

  // ── Persistence + autosave ───────────────────────────────────────────
  // Therapists shouldn't lose a half-written record, so drafts autosave 1.5s
  // after the last edit. To stay correct we (a) serialise every persist —
  // manual and auto — through one promise chain so they never overlap, and
  // (b) mirror activeId in a ref so a persist queued behind the first one sees
  // the id that the create returned (otherwise it would POST a duplicate row).
  // Autosave never marks a record COMPLETED — that stays a deliberate
  // manual action.
  const [autoSaveStatus, setAutoSaveStatus] =
    useState<"idle" | "saving" | "saved" | "error">("idle");
  const activeIdRef = useRef<string | null>(activeId);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const autosaveRef = useRef<() => void>(() => {});

  function enqueue(task: () => Promise<void>): Promise<void> {
    const next = chainRef.current.catch(() => {}).then(task);
    chainRef.current = next;
    return next;
  }

  async function runPersist({
    status,
    manual,
  }: {
    status: "DRAFT" | "COMPLETED";
    manual: boolean;
  }) {
    if (viewOnly) return;
    if (status === "COMPLETED" && isLocked) return;
    if (manual) setPending(true);
    else setAutoSaveStatus("saving");
    try {
      const body = {
        clientId,
        templateKey,
        formData,
        chiefComplaints: chiefComplaints || undefined,
        diagnosis: diagnosis || undefined,
        planOfCare: planOfCare || undefined,
        followUp: followUp || undefined,
        recommendedSessions:
          recommended.length > 0
            ? recommended.reduce((s, r) => s + r.count, 0)
            : undefined,
        recommendedServices: recommended.map((r) => ({
          serviceId: r.serviceId,
          serviceName: r.serviceName,
          count: r.count,
          perAmount: r.perAmount,
          gstRate: r.gstRate,
        })),
        status,
      };

      const id = activeIdRef.current;
      const res = id
        ? await fetch("/api/consultations", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...body }),
          })
        : await fetch("/api/consultations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't save the clinical record." }),
        );
      }
      const out = (await res.json()) as { consultationId: string };
      activeIdRef.current = out.consultationId;
      setActiveId(out.consultationId);
      setDraftStatus(status);

      if (manual) {
        toast.success(
          status === "COMPLETED" ? "Consultation completed and locked" : "Draft saved",
        );
      } else {
        setAutoSaveStatus("saved");
      }
    } catch (err) {
      if (manual) toast.error(err instanceof Error ? err.message : "Save failed");
      else setAutoSaveStatus("error");
    } finally {
      if (manual) setPending(false);
    }
  }

  // Manual buttons: cancel any queued autosave, then enqueue the explicit save
  // (which flushes inventory and may COMPLETE). Serialised behind any in-flight
  // autosave so it can never race into a duplicate row.
  //
  // For COMPLETED we add two gates because locking is irreversible (append-only
  // afterwards; only the OWNER role can edit a locked record). First, ensure
  // the draft actually has content — locking an empty record is almost
  // certainly an accident. Second, ask the user to confirm. Cheap insurance
  // against a costly call to ops.
  function save(status: "DRAFT" | "COMPLETED") {
    if (viewOnly) return;
    if (status === "COMPLETED") {
      const hasContent =
        chiefComplaints.trim() !== "" ||
        diagnosis.trim() !== "" ||
        planOfCare.trim() !== "" ||
        followUp.trim() !== "" ||
        recommended.length > 0 ||
        Object.values(formData).some(
          (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
        );
      if (!hasContent) {
        toast.error(
          "Add at least one note — chief complaint, diagnosis, plan, or a session row — before locking.",
        );
        return;
      }
      const confirmed = window.confirm(
        "Lock this record as completed?\n\nOnce locked it becomes append-only. Only an admin can edit it after.",
      );
      if (!confirmed) return;
    }
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void enqueue(() => runPersist({ status, manual: true }));
  }

  // Point the autosave callback at the latest state on every render (no deps),
  // so the debounce timer below always persists the current form.
  useEffect(() => {
    autosaveRef.current = () => {
      // Only autosave an editable DRAFT — never re-draft a COMPLETED record,
      // and skip until there's something meaningful to persist.
      if (viewOnly || isLocked || draftStatus !== "DRAFT") return;
      const hasContent =
        !!activeIdRef.current ||
        chiefComplaints.trim() !== "" ||
        diagnosis.trim() !== "" ||
        planOfCare.trim() !== "" ||
        followUp.trim() !== "" ||
        recommended.length > 0 ||
        Object.values(formData).some(
          (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
        );
      if (!hasContent) return;
      void enqueue(() => runPersist({ status: "DRAFT", manual: false }));
    };
  });

  // Debounced trigger: schedule an autosave 1.5s after the last edit. Skips the
  // initial mount so an untouched form never creates a blank draft. Scheduling
  // a timer (not a synchronous setState) keeps react-hooks/purity happy.
  useEffect(() => {
    if (viewOnly) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    autosaveTimerRef.current = setTimeout(() => autosaveRef.current(), 1500);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [formData, chiefComplaints, diagnosis, planOfCare, followUp, recommended, viewOnly]);

  const saveLabel = pending ? "Saving…" : isLocked ? "Locked" : "Complete & lock";

  return (
    <div className="space-y-4 pb-24">
      {/* Page header — title + meta + autosave pill + actions. Non-sticky
          (the parent patient layout already provides a sticky chrome strip;
          stacking two stickies fights with the variable-height of the
          parent and causes the page header to either overlap or float
          mid-page). The sticky-footer pill below keeps Save/Lock reachable
          while scrolling. */}
      <header className="space-y-2 border-b border-[color:var(--border-light)] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              Clinical record {isFirstVisit ? "· first visit" : "· follow-up"}
            </p>
            <h1 className="break-words text-xl font-semibold tracking-tight">
              {TEMPLATE_LABELS[templateKey]} — {patientName}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {department ? <span>{department}</span> : null}
              {department ? <span>·</span> : null}
              <span>template: {templateKey}</span>
              {isLocked ? <Badge variant="warning">locked</Badge> : null}
              {viewOnly ? (
                <Badge variant="default">read-only (reassigned away)</Badge>
              ) : null}
            </p>
          </div>
          {/* Page-header action cluster — autosave + Open PDF + Save/Lock.
            * On mobile (<sm) the Save/Lock buttons are hidden because the
            * sticky-footer pill below the body provides the same buttons in
            * a more reachable spot. Open PDF + autosave stay on at all
            * breakpoints because they're status, not action. */}
          <div className="flex flex-wrap items-center gap-2">
            <AutosavePill status={autoSaveStatus} viewOnly={viewOnly} isLocked={isLocked} />
            {activeId ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/consultations/${activeId}/render`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open DOCX
                </a>
              </Button>
            ) : null}
            {!viewOnly ? (
              <div className="hidden flex-wrap items-center gap-2 sm:flex">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || isLocked}
                  onClick={() => save("DRAFT")}
                >
                  Save draft
                </Button>
                <Button
                  size="sm"
                  disabled={pending || isLocked}
                  onClick={() => save("COMPLETED")}
                >
                  {saveLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Body: 200px sticky section rail + 1fr main column.
          On mobile (lg breakpoint), rail collapses to a no-op. */}
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <SectionRail />
        </div>
        <div id="clinical-main" className="min-w-0 space-y-3.5">
          <PerTemplateForm
            templateKey={templateKey}
            formData={formData}
            setFormData={setFormData}
            chiefComplaints={chiefComplaints}
            setChiefComplaints={setChiefComplaints}
            diagnosis={diagnosis}
            setDiagnosis={setDiagnosis}
            planOfCare={planOfCare}
            setPlanOfCare={setPlanOfCare}
            followUp={followUp}
            setFollowUp={setFollowUp}
            disabled={disabled}
          />

          {/* Session protocol — every clinical template gets this textarea
              so the therapist can record what was actually done in this
              session (exercises, modalities, progressions). Lives in
              formData.sessionProtocol; no separate schema column. */}
          <SessionProtocolField
            value={(formData.sessionProtocol as string | undefined) ?? ""}
            onChange={(v) => setFormData({ ...formData, sessionProtocol: v })}
            disabled={disabled}
          />

          {/* Therapist recommendation — FO converts to a Package downstream. */}
          <Section
            title="Recommended sessions"
            description="Therapist proposes service mix. FO converts on the Packages tab."
          >
            <RecommendationPicker
              services={services}
              value={recommended}
              onChange={setRecommended}
              disabled={disabled}
            />
          </Section>

          {/* Prior consultations — same template family, read-only context. */}
          {consultations.length > 0 ? (
            <Section
              title={`Prior records (${consultations.length})`}
              description="Same template family. Open the PDF to review."
            >
              <ul className="divide-y divide-[color:var(--border-light)]">
                {consultations.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                  >
                    <span>
                      <span className="font-medium">{c.templateKey}</span>{" "}
                      <span className="text-muted-foreground">
                        · {new Date(c.date).toLocaleDateString("en-IN")}
                      </span>{" "}
                      <span className="text-muted-foreground">· {c.consultantName ?? "—"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={c.status === "COMPLETED" ? "success" : "default"}>
                        {c.status}
                      </Badge>
                      <a
                        href={`/api/consultations/${c.id}/render`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        DOCX
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>

      {/* Sticky footer — autosave status + Save / Lock buttons stay reachable
          while scrolling a long form. Hidden when view-only since there's
          nothing to act on. On narrow viewports the autosave pill drops to
          icon-only (handled in AutosavePill compact branch). */}
      {!viewOnly ? (
        <div className="fixed bottom-3 left-1/2 z-20 flex max-w-[calc(100vw-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] bg-card/95 px-2.5 py-2 shadow-[0_10px_30px_-12px_rgba(26,26,30,0.35)] backdrop-blur sm:rounded-full sm:px-3">
          <div className="hidden sm:inline-flex">
            <AutosavePill status={autoSaveStatus} viewOnly={viewOnly} isLocked={isLocked} compact />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || isLocked}
            onClick={() => save("DRAFT")}
          >
            Save draft
          </Button>
          <Button
            size="sm"
            disabled={pending || isLocked}
            onClick={() => save("COMPLETED")}
          >
            {saveLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Visible autosave indicator. Tracks the shell's `autoSaveStatus` machine —
// idle / saving / saved / error — and renders a chip. Compact variant drops
// the prose so it fits in the sticky footer pill.
function AutosavePill({
  status,
  viewOnly,
  isLocked,
  compact,
}: {
  status: "idle" | "saving" | "saved" | "error";
  viewOnly: boolean;
  isLocked: boolean;
  compact?: boolean;
}) {
  if (viewOnly || isLocked) {
    return (
      <span className="autosave">
        <span className="dot" style={{ background: "var(--text-tertiary)" }} aria-hidden />
        {compact ? "Read-only" : "Read-only"}
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="autosave">
        <span className="dot" style={{ background: "var(--warning)" }} aria-hidden />
        {compact ? "Saving…" : "Autosaving…"}
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="autosave" style={{ color: "#15683b" }}>
        <span className="dot live" aria-hidden />
        {compact ? "Saved" : "Draft saved"}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="autosave" style={{ color: "var(--danger)" }}>
        <span className="dot" style={{ background: "var(--danger)" }} aria-hidden />
        {compact ? "Save failed" : "Autosave failed — use Save draft"}
      </span>
    );
  }
  return (
    <span className="autosave">
      <span className="dot" aria-hidden style={{ background: "var(--text-tertiary)" }} />
      {compact ? "Ready" : "Autosave ready"}
    </span>
  );
}

interface PerTemplateProps {
  templateKey: DocxTemplateKey;
  formData: Record<string, unknown>;
  setFormData: (v: Record<string, unknown>) => void;
  chiefComplaints: string;
  setChiefComplaints: (v: string) => void;
  diagnosis: string;
  setDiagnosis: (v: string) => void;
  planOfCare: string;
  setPlanOfCare: (v: string) => void;
  followUp: string;
  setFollowUp: (v: string) => void;
  disabled: boolean;
}

function PerTemplateForm(props: PerTemplateProps) {
  switch (props.templateKey) {
    case "physician":
      return <PhysicianConsultationForm {...props} />;
    case "physiotherapy":
      return <PhysiotherapyConsultationForm {...props} />;
    case "physician-followup":
      return <PhysicianFollowupForm {...props} />;
    case "physiotherapy-followup":
      return <PhysiotherapyFollowupForm {...props} />;
    case "sc-followup":
      return <SCFollowupForm {...props} />;
    case "yoga-followup":
      return <YogaFollowupForm {...props} />;
    case "counselling-followup":
      return <CounsellingFollowupForm {...props} />;
    case "nutrition-followup":
      return <NutritionFollowupForm {...props} />;
    case "yoga-intake":
      return <YogaIntakeForm {...props} />;
    case "counselling-intake":
      return <CounsellingIntakeForm {...props} />;
    case "fab":
      return <FabForm {...props} />;
    case "common-intake":
    default:
      return null;
  }
}

export type { PerTemplateProps as ClinicalFormProps };
