"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECT_NONE } from "@/lib/select-styles";
import {
  SERVICE_CATEGORIES,
  categoriesForDepartment,
  departmentsForCategories,
  type ServiceCategoryKey,
} from "@/lib/categories";
import {
  IntakeFormShell,
  type IntakeFormState,
  type IntakePayload,
} from "@/components/intake/intake-form-shell";
import { readApiError } from "@/lib/error-messages";
import { Star } from "lucide-react";

interface DraftClient {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  age: number | null;
  sex: string | null;
  email: string | null;
  createdAt: string;
  selectedCategories: ServiceCategoryKey[];
  intakeFormId: string | null;
  // True when the latest IntakeForm has consentSigned. Drives "consent
  // already done — just needs assignment" vs "needs to sign" routing.
  consentSigned: boolean;
  // True when client.status === "ACTIVE" — they're past the assign step
  // and only here to finish consent. Skips the assign step on selection.
  status: "DRAFT" | "ACTIVE";
}

interface TherapistOption {
  id: string;
  name: string;
  role: string;
  designation: string | null;
  department: string | null;
}

interface ReferralOption {
  id: string;
  name: string;
}

interface Props {
  drafts: DraftClient[];
  therapists: TherapistOption[];
  referralSources: ReferralOption[];
}

type Step = "intake" | "assign" | "consent" | "done";

function initialStepFor(d: DraftClient | null): Step {
  if (!d) return "assign";
  // No intake yet → start by capturing it. FO fills on behalf for walk-ins
  // that didn't come through the public QR link (PRD §4 A3).
  if (d.intakeFormId == null) return "intake";
  // Already ACTIVE (past assignment) but consent never landed → resume at
  // consent. The "switched away mid-consent" recovery path.
  if (d.status === "ACTIVE" && !d.consentSigned) return "consent";
  return "assign";
}

export function AssignDashboard({ drafts, therapists, referralSources }: Props) {
  // Deep-link support: `/dashboard/assign?client=<id>` auto-selects that
  // draft. Used by the "Intake pending" chip on the patient list — clicking
  // it lands you here with the walk-in already focused.
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const requestedId = searchParams.get("client");
  const initial =
    (requestedId ? drafts.find((d) => d.id === requestedId) : null) ??
    drafts[0] ??
    null;
  const [active, setActive] = useState<DraftClient | null>(initial);
  const [step, setStep] = useState<Step>(initialStepFor(initial));
  const [list, setList] = useState<DraftClient[]>(drafts);

  function selectDraft(d: DraftClient) {
    setActive(d);
    setStep(initialStepFor(d));
  }

  function onIntakeCaptured(intakeFormId: string, categories: ServiceCategoryKey[]) {
    if (!active) return;
    const patched: DraftClient = {
      ...active,
      intakeFormId,
      selectedCategories: categories,
    };
    setActive(patched);
    setList((prev) => prev.map((d) => (d.id === patched.id ? patched : d)));
    setStep("assign");
  }

  function onAssigned() {
    setStep("consent");
  }

  function onConsentDone() {
    setStep("done");
    if (!active) return;
    // Drop the just-assigned draft from the queue.
    const remaining = list.filter((d) => d.id !== active.id);
    setList(remaining);
    setTimeout(() => {
      const next = remaining[0] ?? null;
      setActive(next);
      setStep(initialStepFor(next));
    }, 1500);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Assignment queue</h1>
        <p className="text-sm text-muted-foreground">
          Patients who submitted intake forms and are waiting to be assigned a therapist.
        </p>
      </header>

      {list.length === 0 && step !== "consent" && step !== "done" ? (
        <EmptyState
          title="No pending intakes"
          description="Generate a QR from the New intake page when a walk-in arrives."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Pending ({list.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {list.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => selectDraft(d)}
                      className={`flex w-full items-start justify-between gap-3 px-5 py-3 text-left transition-colors ${
                        active?.id === d.id
                          ? "bg-secondary"
                          : "hover:bg-accent"
                      }`}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {d.firstName} {d.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {d.clientCode} · {d.phone}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {d.selectedCategories.slice(0, 3).map((k) => (
                            <Badge key={k} variant="outline" className="text-[10px]">
                              {labelFor(k)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {active ? (
            step === "intake" ? (
              <IntakeOnBehalfPanel client={active} onCaptured={onIntakeCaptured} />
            ) : step === "consent" ? (
              <ConsentPanel client={active} onDone={onConsentDone} />
            ) : step === "done" ? (
              <Card>
                <CardContent className="p-10 text-center text-sm">
                  <p className="font-medium">{active.firstName} is now ACTIVE.</p>
                  <p className="text-muted-foreground">Loading next patient…</p>
                </CardContent>
              </Card>
            ) : (
              <AssignPanel
                client={active}
                therapists={therapists}
                referralSources={referralSources}
                onAssigned={onAssigned}
              />
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

function labelFor(key: ServiceCategoryKey): string {
  return SERVICE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function AssignPanel({
  client,
  therapists,
  referralSources,
  onAssigned,
}: {
  client: DraftClient;
  therapists: TherapistOption[];
  referralSources: ReferralOption[];
  onAssigned: () => void;
}) {
  const eligibleDepartments = useMemo(
    () => departmentsForCategories(client.selectedCategories),
    [client.selectedCategories],
  );

  // Group all therapists by department for the accordion. Departments the
  // patient selected are expanded by default; the others are collapsed but
  // still pickable (the FO can assign anyone, not just matching depts).
  const therapistsByDepartment = useMemo(() => {
    const groups = new Map<string, TherapistOption[]>();
    for (const t of therapists) {
      const key = t.department ?? "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    // Stable sort: eligible departments first, then alphabetical.
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const aEligible = eligibleDepartments.includes(a) ? 0 : 1;
      const bEligible = eligibleDepartments.includes(b) ? 0 : 1;
      if (aEligible !== bEligible) return aEligible - bEligible;
      return a.localeCompare(b);
    });
  }, [therapists, eligibleDepartments]);

  const [customerType, setCustomerType] = useState<"WALK_IN" | "BOOKING" | "REFERRAL">("WALK_IN");
  const [referralSourceId, setReferralSourceId] = useState<string>("");
  const [referredByName, setReferredByName] = useState("");
  const [comment, setComment] = useState("");
  const [selectedTherapists, setSelectedTherapists] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Expanded department accordion state — initially the patient's selected
  // departments are open, everything else collapsed.
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(
    () => new Set(eligibleDepartments),
  );
  function toggleDept(name: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Effective primary = the explicit pick if still selected, else the first
  // selected therapist. PRD §4 A4: first assignment is primary by default, but
  // the FO can now choose which one explicitly via the ★ control.
  const effectivePrimary =
    primaryId && selectedTherapists.includes(primaryId)
      ? primaryId
      : (selectedTherapists[0] ?? null);

  function toggleTherapist(id: string) {
    setSelectedTherapists((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit() {
    if (selectedTherapists.length === 0) {
      toast.error("Select at least one therapist");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerType,
          referralSourceId: referralSourceId || undefined,
          referredByName: referredByName.trim() || undefined,
          therapists: selectedTherapists.map((staffId) => ({
            staffId,
            isPrimary: staffId === effectivePrimary,
            comment: comment.trim() || undefined,
          })),
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't save the assignment." }));
      }
      toast.success("Assignment saved. Capture consent next.");
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {client.firstName} {client.lastName}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {client.clientCode} · {client.phone}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold">Patient picked these</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {client.selectedCategories.length === 0 ? (
              <span className="text-sm text-muted-foreground">No categories selected</span>
            ) : (
              client.selectedCategories.map((k) => (
                <Badge key={k} variant="info">
                  {labelFor(k)}
                </Badge>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Customer type</Label>
            <Select
              value={customerType}
              onValueChange={(v) => setCustomerType(v as typeof customerType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WALK_IN">Walk-in</SelectItem>
                <SelectItem value="BOOKING">Pre-booking</SelectItem>
                <SelectItem value="REFERRAL">Referral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Referral source</Label>
            <Select
              value={referralSourceId === "" ? SELECT_NONE : referralSourceId}
              onValueChange={(v) => setReferralSourceId(v === SELECT_NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="— none —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>— none —</SelectItem>
                {referralSources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Referred by (free text)</Label>
            <Input
              value={referredByName}
              onChange={(e) => setReferredByName(e.target.value)}
              placeholder="e.g. Dr. Sharma at Lilavati"
            />
          </div>
        </section>

        <section>
          <Label className="mb-2 block">Assign therapist(s)</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            {eligibleDepartments.length === 0
              ? "Browse any department below."
              : `Patient picked: ${eligibleDepartments.join(" / ")} — those are expanded. Open any other department to pick from there.`}{" "}
            Tick one or more — the ★ marks the primary therapist (first by default).
          </p>
          <div className="space-y-2">
            {therapistsByDepartment.map(([deptName, deptTherapists]) => {
              const isEligible = eligibleDepartments.includes(deptName);
              const isOpen = expandedDepts.has(deptName);
              const selectedInDept = deptTherapists.filter((t) => selectedTherapists.includes(t.id)).length;
              return (
                <div
                  key={deptName}
                  className="overflow-hidden rounded-lg border border-[color:var(--border-light)] bg-card"
                >
                  <button
                    type="button"
                    onClick={() => toggleDept(deptName)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <span
                      aria-hidden
                      className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      ▸
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{deptName}</p>
                      <p className="text-[11px] text-[color:var(--text-tertiary)]">
                        {deptTherapists.length} therapist{deptTherapists.length === 1 ? "" : "s"}
                        {selectedInDept > 0 ? ` · ${selectedInDept} selected` : ""}
                      </p>
                    </div>
                    {isEligible ? (
                      <span className="chip chip-success">Patient picked</span>
                    ) : null}
                  </button>
                  {isOpen ? (
                    <ul className="grid grid-cols-1 gap-1 border-t border-[color:var(--border-light)] bg-secondary/40 p-2 sm:grid-cols-2">
                      {deptTherapists.map((t) => {
                        const matchingCategories = categoriesForDepartment(t.department).filter(
                          (c) => client.selectedCategories.includes(c.key),
                        );
                        const isSelected = selectedTherapists.includes(t.id);
                        const isPrimary = effectivePrimary === t.id;
                        return (
                          <li
                            key={t.id}
                            className={`flex items-start gap-2 rounded-md border p-3 transition-colors ${
                              isSelected
                                ? "border-[color:var(--primary)] bg-card"
                                : "border-transparent bg-card hover:border-[color:var(--border)]"
                            }`}
                          >
                            <label className="flex flex-1 cursor-pointer items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTherapist(t.id)}
                                className="mt-0.5 h-4 w-4"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium">{t.name}</p>
                                  {isPrimary ? (
                                    <Badge variant="info" className="text-[10px]">★ Primary</Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {t.designation ?? t.role}
                                </p>
                                {matchingCategories.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {matchingCategories.map((c) => (
                                      <span
                                        key={c.key}
                                        className="chip chip-success"
                                        title={`Matches the patient's ${c.label} request`}
                                      >
                                        ✓ {c.label}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </label>
                            {isSelected && !isPrimary ? (
                              <button
                                type="button"
                                onClick={() => setPrimaryId(t.id)}
                                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-[10px] font-medium text-[color:var(--text-secondary)] hover:border-primary hover:text-primary"
                                title="Make this the primary therapist"
                              >
                                <Star className="h-3 w-3" /> Set primary
                              </button>
                            ) : null}
                            {isPrimary ? (
                              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 px-2 py-1 text-[10px] font-semibold text-primary">
                                <Star className="h-3 w-3 fill-current" /> Primary
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <Label htmlFor="assign-comment">Note (optional)</Label>
          <Input
            id="assign-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. patient prefers female therapist"
          />
        </section>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || selectedTherapists.length === 0}>
            {pending ? "Saving…" : "Save & continue to consent →"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsentPanel({ client, onDone }: { client: DraftClient; onDone: () => void }) {
  const [method, setMethod] = useState<"DIGITAL_PAD" | "PHYSICAL_SCAN">("DIGITAL_PAD");
  const [pending, setPending] = useState(false);
  // Two-stage preview-then-finalize state:
  //   capturedSignature stores the data URL once "Preview" succeeds, so
  //     "Finalize" doesn't ask the patient to sign again
  //   previewed flips true after the FO opens the preview blob so the
  //     "Finalize" button only shows up post-review
  const [capturedSignature, setCapturedSignature] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState(false);

  // Digital pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  // Scan upload
  const [scanDataUrl, setScanDataUrl] = useState<string | null>(null);

  // Re-arming: when the FO switches signature method or clears the pad we
  // discard any previously-previewed capture so they go through the loop
  // again. Prevents a stale signature getting finalised after a "Clear".
  function rearm() {
    setCapturedSignature(null);
    setPreviewed(false);
  }

  useEffect(() => {
    if (method !== "DIGITAL_PAD") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { backgroundColor: "rgba(255,255,255,0)" });
    padRef.current = pad;
    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [method]);

  function clearPad() {
    padRef.current?.clear();
    rearm();
  }

  function downloadConsent(format: "docx" | "pdf") {
    const url = `/api/clients/${client.id}/consent-render?format=${format}`;
    window.open(url, "_blank");
  }

  async function onScanFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // 10 MB cap covers a typical 12-megapixel phone photo (~6 MB JPEG) and a
    // multi-page A4 scan, without bloating the IntakeForm.signatureDataUrl
    // column. Anything bigger should be compressed before upload.
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScanDataUrl(typeof reader.result === "string" ? reader.result : null);
      rearm();
    };
    reader.readAsDataURL(file);
  }

  function collectSignature(): string | null {
    if (client.intakeFormId == null) {
      toast.error(
        "This patient hasn't filled out the intake form yet. Capture it before saving consent.",
      );
      return null;
    }
    if (method === "DIGITAL_PAD") {
      if (!padRef.current || padRef.current.isEmpty()) {
        toast.error("Have the patient sign on the pad");
        return null;
      }
      return padRef.current.toDataURL("image/png");
    }
    if (!scanDataUrl) {
      toast.error("Upload the signed scan first");
      return null;
    }
    return scanDataUrl;
  }

  // Step 1: render the consent with the IN-MEMORY signature so the FO can
  // review BEFORE persisting. Does NOT save anything to the DB. The new
  // tab gets a one-shot DOCX from /consent-preview.
  async function preview() {
    const dataUrl = collectSignature();
    if (!dataUrl) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/clients/${client.id}/consent-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureDataUrl: dataUrl, method }),
        },
      );
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't render preview." }));
      }
      const blob = await res.blob();
      const previewBlobUrl = URL.createObjectURL(blob);
      window.open(previewBlobUrl, "_blank");
      // Cache the captured signature so the final-save step doesn't ask the
      // patient to sign again. This is the whole point of the two-step flow.
      setCapturedSignature(dataUrl);
      setPreviewed(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPending(false);
    }
  }

  // Step 2: the FO has eyeballed the preview and is happy. Persist.
  async function finalize() {
    const dataUrl = capturedSignature ?? collectSignature();
    if (!dataUrl) return;
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentMethod: method, signatureDataUrl: dataUrl }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't save consent." }));
      }
      toast.success("Consent finalized. Patient is now ACTIVE.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Consent submit failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Consent for {client.firstName} {client.lastName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
          <p className="text-sm">
            Render the prefilled consent form for the patient to read or sign on paper.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadConsent("docx")}>
              Download DOCX
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadConsent("pdf")}>
              Open PDF
            </Button>
          </div>
        </section>

        <section className="flex gap-2">
          <Button
            type="button"
            variant={method === "DIGITAL_PAD" ? "default" : "outline"}
            onClick={() => {
              setMethod("DIGITAL_PAD");
              rearm();
            }}
          >
            Digital pad
          </Button>
          <Button
            type="button"
            variant={method === "PHYSICAL_SCAN" ? "default" : "outline"}
            onClick={() => {
              setMethod("PHYSICAL_SCAN");
              rearm();
            }}
          >
            Upload scan
          </Button>
        </section>

        {method === "DIGITAL_PAD" ? (
          <section className="space-y-2">
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              Digital signature is for record-keeping only. Not legally binding without an
              audit-trailed e-signature provider.
            </p>
            <div className="rounded-md border bg-white">
              <canvas ref={canvasRef} className="block h-[220px] w-full touch-none" />
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={clearPad}>
                Clear
              </Button>
            </div>
          </section>
        ) : (
          <section className="space-y-2">
            <Label>Upload signed consent (photo or scan)</Label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={onScanFileChosen}
              className="block w-full text-sm"
            />
            {scanDataUrl && scanDataUrl.startsWith("data:image") ? (
              <img
                src={scanDataUrl}
                alt="Uploaded consent"
                className="max-h-64 rounded-md border object-contain"
              />
            ) : null}
            {scanDataUrl && !scanDataUrl.startsWith("data:image") ? (
              <p className="text-xs text-muted-foreground">PDF received and ready to upload.</p>
            ) : null}
          </section>
        )}

        {/* Two-stage flow per PRD §6.5 update:
            (1) FO clicks "Preview signed consent" — opens a new tab with
                the rendered DOCX/PDF containing the captured signature.
            (2) Once previewed, "Confirm & finalize" appears.
            This prevents accidental commit of a wrong/blank/wonky signature
            and gives the FO a chance to see the document end-to-end before
            the patient leaves the desk. */}
        <section className="rounded-md border border-[color:var(--border-light)] bg-muted/30 p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            {previewed ? "Step 2 of 2 — final save" : "Step 1 of 2 — review before saving"}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {previewed
                ? "If the consent looks right, finalize. If the signature needs another go, clear and re-sign."
                : "Capture the signature, then preview the consent. We'll show you the rendered form before anything is saved."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={previewed ? "outline" : "default"}
                onClick={preview}
                disabled={pending}
              >
                {pending && !previewed
                  ? "Rendering…"
                  : previewed
                    ? "Preview again"
                    : "Preview signed consent →"}
              </Button>
              {previewed ? (
                <Button onClick={finalize} disabled={pending}>
                  {pending ? "Saving…" : "Confirm & finalize"}
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function IntakeOnBehalfPanel({
  client,
  onCaptured,
}: {
  client: DraftClient;
  onCaptured: (intakeFormId: string, categories: ServiceCategoryKey[]) => void;
}) {
  const [showInlineForm, setShowInlineForm] = useState(false);
  const initial: Partial<IntakeFormState> = {
    firstName: client.firstName ?? "",
    lastName: client.lastName ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    sex: client.sex === "M" || client.sex === "F" || client.sex === "OTHER" ? client.sex : "",
    selectedCategories: client.selectedCategories,
  };

  async function onSubmit(payload: IntakePayload) {
    const res = await fetch(`/api/clients/${client.id}/intake-on-behalf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(
        await readApiError(res, { fallback: "Couldn't save the intake form." }),
      );
    }
    const body = (await res.json()) as { intakeFormId: string };
    toast.success("Intake captured. Continue to assignment.");
    onCaptured(body.intakeFormId, payload.selectedCategories);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Intake for {client.firstName} {client.lastName}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {client.clientCode}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showInlineForm ? (
          <div className="space-y-3 rounded-md border border-[color:var(--border-light)] bg-card p-5">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Send the intake link to the patient (preferred)</p>
              <p className="text-xs text-muted-foreground">
                Patients fill their own intake — keeps the data accurate and the patient&apos;s
                agreement first-hand. Generate a QR / link from the New intake page (top of the
                sidebar), share it with the patient on WhatsApp / SMS, and they&apos;ll appear in
                this queue when they&apos;re done.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/intake"
                className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90"
              >
                Open New intake →
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Fill the intake form on behalf of the patient?\n\nUse only when the patient is unable to fill it themselves — they should still review and sign the consent at the end.",
                    )
                  ) {
                    setShowInlineForm(true);
                  }
                }}
              >
                Fill on behalf (fallback)
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Filling on behalf — patient still signs the consent at the end. Prefer the patient
              fills it themselves via the intake link whenever possible.
            </div>
            <IntakeFormShell
              variant="inline"
              submitLabel="Save intake →"
              initial={initial}
              onSubmit={onSubmit}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
