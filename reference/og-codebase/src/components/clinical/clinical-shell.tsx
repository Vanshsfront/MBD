"use client";

// Clinical shell — owns the save state machine and dispatches the right
// per-template form. Each per-template form takes (formData, setFormData,
// disabled) and renders its own UI; the shell handles persistence,
// recommendations, locking, and the PDF render link.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DocxTemplateKey } from "@/lib/templates/keys";
import { readApiError } from "@/lib/error-messages";
import {
  type RecommendationItem,
  FormFooter,
  RecommendationPicker,
  Section,
  type ServiceOption,
} from "./shared";
import {
  InventoryUsageWidget,
  type InventoryItemOption,
  type InventoryUsageItem,
} from "./inventory-usage-widget";

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
  inventory: InventoryItemOption[];
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
  inventory,
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
  // Inventory consumed during this session (PRD §4 C5). Flushed to
  // /api/inventory-usage AFTER the consultation save returns success so we
  // have a consultationId to bind the InventoryLog rows to.
  const [inventoryUsage, setInventoryUsage] = useState<InventoryUsageItem[]>([]);

  const isLocked = draftStatus === "COMPLETED" && !canEditCompleted;
  const disabled = isLocked || viewOnly;

  async function save(status: "DRAFT" | "COMPLETED") {
    if (viewOnly) return;
    setPending(true);
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

      const res = activeId
        ? await fetch("/api/consultations", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: activeId, ...body }),
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
      setActiveId(out.consultationId);
      setDraftStatus(status);

      // Flush queued inventory usage AFTER the consultation save lands so
      // we can bind InventoryLog rows to the consultationId. We swallow
      // partial failures with a toast — the consultation itself is already
      // persisted; the therapist can re-record usage if needed.
      if (inventoryUsage.length > 0) {
        try {
          const ir = await fetch("/api/inventory-usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              consultationId: out.consultationId,
              items: inventoryUsage.map((u) => ({
                inventoryItemId: u.inventoryItemId,
                qty: u.qty,
                notes: u.notes,
              })),
            }),
          });
          if (!ir.ok) {
            toast.error(
              await readApiError(ir, { fallback: "Couldn't log inventory usage." }),
            );
          } else {
            toast.success(
              `Logged ${inventoryUsage.length} inventory line${inventoryUsage.length === 1 ? "" : "s"}`,
            );
            setInventoryUsage([]);
          }
        } catch (err) {
          toast.error(
            err instanceof Error ? `Inventory log failed: ${err.message}` : "Inventory log failed",
          );
        }
      }

      toast.success(
        status === "COMPLETED" ? "Consultation completed and locked" : "Draft saved",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {TEMPLATE_LABELS[templateKey]} — {patientName}
          </CardTitle>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {department ? (
              <span>{department}</span>
            ) : null}
            <span>· template: {templateKey}</span>
            {isFirstVisit ? <Badge variant="info">first visit</Badge> : null}
            {isLocked ? <Badge variant="warning">locked</Badge> : null}
            {viewOnly ? (
              <Badge variant="default">read-only (reassigned away)</Badge>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Per-template form. All forms accept the same set of common props
              and call setFormData with their typed payload (via cast). */}
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

          {/* Inventory usage — tape, supplements, etc. consumed during the
              session. PRD §4 C5. Decrements stock + logs on save. */}
          {inventory.length > 0 ? (
            <>
              <Separator />
              <InventoryUsageWidget
                options={inventory}
                value={inventoryUsage}
                onChange={setInventoryUsage}
                disabled={disabled}
              />
            </>
          ) : null}

          {/* Recommendation picker — therapist proposes services; FO converts
              into a Package on /dashboard/patients/[id]/packages. */}
          <Separator />
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

          <FormFooter
            pending={pending}
            isLocked={isLocked}
            isViewOnly={viewOnly}
            activeId={activeId}
            onSaveDraft={() => save("DRAFT")}
            onComplete={() => save("COMPLETED")}
          />
        </CardContent>
      </Card>

      {/* Prior consultations — read-only context. Same template family. */}
      {consultations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Prior records ({consultations.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {consultations.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-6 py-2 text-xs"
                >
                  <span>
                    <span className="font-medium">{c.templateKey}</span>{" "}
                    <span className="text-muted-foreground">
                      · {new Date(c.date).toLocaleDateString("en-IN")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {c.consultantName ?? "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={c.status === "COMPLETED" ? "success" : "default"}
                    >
                      {c.status}
                    </Badge>
                    <a
                      href={`/api/consultations/${c.id}/render?format=pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      PDF
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
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
