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
  /** M | F | NO_PREFERENCE, or null. Only M/F ever produce a warning. */
  preferredTherapistGender: string | null;
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
  /** M | F | OTHER, or null when not yet on file. */
  gender: string | null;
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

/**
 * True when the patient asked for a specific therapist gender and this
 * therapist isn't it.
 *
 * A flag, never a block — there may be a good reason to proceed (nobody of the
 * preferred gender is in that day), but FO shouldn't be able to do it without
 * seeing it. Deliberately silent when either side is unknown: no stated
 * preference, or a therapist whose gender an admin hasn't filled in yet.
 */
function genderMismatch(client: DraftClient, therapist: TherapistOption): boolean {
  const preferred = client.preferredTherapistGender;
  if (preferred !== "M" && preferred !== "F") return false;
  if (!therapist.gender) return false;
  return therapist.gender !== preferred;
}

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
          {client.preferredTherapistGender === "M" ||
          client.preferredTherapistGender === "F" ? (
            <p className="mb-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-900">
              Patient asked for a{" "}
              {client.preferredTherapistGender === "F" ? "female" : "male"} therapist. Mismatched
              therapists are flagged below — you can still assign one if needed.
            </p>
          ) : null}
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
                                {genderMismatch(client, t) ? (
                                  <p className="text-xs font-medium text-orange-800">
                                    ⚠ Patient asked for a{" "}
                                    {client.preferredTherapistGender === "F"
                                      ? "female"
                                      : "male"}{" "}
                                    therapist
                                  </p>
                                ) : null}
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

type SignatureMethod = "DIGITAL_PAD" | "PHYSICAL_SCAN";

/**
 * Both capture methods are retained side by side, and the selected `method`
 * decides which one is used. That's deliberate: the canvas is unmounted
 * whenever the upload option is shown, which destroys the SignaturePad and
 * everything drawn on it — so if the pad's image only lived on the canvas,
 * merely glancing at the other tab would silently discard a signature the
 * patient had already given.
 */
interface SignatureState {
  method: SignatureMethod;
  padDataUrl: string | null;
  scanDataUrl: string | null;
}

const EMPTY_SIGNATURE: SignatureState = {
  method: "DIGITAL_PAD",
  padDataUrl: null,
  scanDataUrl: null,
};

function activeSignatureOf(s: SignatureState): string | null {
  return s.method === "DIGITAL_PAD" ? s.padDataUrl : s.scanDataUrl;
}

function SignatureCapture({
  value,
  onChange,
  onRearm,
  showDisclaimer = false,
  uploadLabel,
}: {
  value: SignatureState;
  onChange: (next: SignatureState) => void;
  /** Called whenever the captured signature changes, to invalidate a preview. */
  onRearm: () => void;
  showDisclaimer?: boolean;
  uploadLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  // Keep the latest value/handlers reachable from the pad effect without making
  // them dependencies — re-creating the pad mid-signature would wipe it. This
  // sync must be declared before that effect so it has run by the time the pad
  // is (re)built.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onRearmRef = useRef(onRearm);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    onRearmRef.current = onRearm;
  });

  useEffect(() => {
    if (value.method !== "DIGITAL_PAD") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { backgroundColor: "rgba(255,255,255,0)" });
    padRef.current = pad;

    // Repaint whatever was captured before this canvas last unmounted.
    const existing = valueRef.current.padDataUrl;
    if (existing) {
      void pad.fromDataURL(existing, {
        width: canvas.offsetWidth,
        height: canvas.offsetHeight,
      });
    }

    // Capture on every stroke, so state is always current even if the canvas
    // is torn down a moment later.
    const onEndStroke = () => {
      onChangeRef.current({ ...valueRef.current, padDataUrl: pad.toDataURL("image/png") });
      onRearmRef.current();
    };
    pad.addEventListener("endStroke", onEndStroke);

    return () => {
      pad.removeEventListener("endStroke", onEndStroke);
      pad.off();
      padRef.current = null;
    };
  }, [value.method]);

  function setMethod(method: SignatureMethod) {
    onChange({ ...value, method });
    onRearm();
  }

  // Explicit reset — the only paths meant to discard a captured signature.
  function clearPad() {
    padRef.current?.clear();
    onChange({ ...value, padDataUrl: null });
    onRearm();
  }
  function clearScan() {
    onChange({ ...value, scanDataUrl: null });
    if (scanInputRef.current) scanInputRef.current.value = "";
    onRearm();
  }

  function onScanFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Only PNG/JPEG survive the render: the docx image module matches
    // data:image/(png|jpeg) and silently substitutes a 1x1 transparent pixel
    // for anything else, so a PDF here would "work" right up until the printed
    // consent came out with a blank signature. Reject it at the door instead.
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      toast.error("Upload a PNG or JPEG image of the signed form (not a PDF).");
      if (scanInputRef.current) scanInputRef.current.value = "";
      return;
    }
    // 10 MB cap covers a typical 12-megapixel phone photo (~6 MB JPEG) and a
    // multi-page A4 scan, without bloating the IntakeForm.signatureDataUrl
    // column. Anything bigger should be compressed before upload.
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      if (scanInputRef.current) scanInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...valueRef.current,
        scanDataUrl: typeof reader.result === "string" ? reader.result : null,
      });
      onRearm();
    };
    reader.readAsDataURL(file);
  }

  const active = activeSignatureOf(value);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={value.method === "DIGITAL_PAD" ? "default" : "outline"}
            onClick={() => setMethod("DIGITAL_PAD")}
          >
            Digital pad
            {value.padDataUrl ? <span className="ml-1.5 text-xs">✓</span> : null}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value.method === "PHYSICAL_SCAN" ? "default" : "outline"}
            onClick={() => setMethod("PHYSICAL_SCAN")}
          >
            Upload scan
            {value.scanDataUrl ? <span className="ml-1.5 text-xs">✓</span> : null}
          </Button>
        </div>
        {active ? (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-900">
            ✓ Signature captured
            {value.method === "DIGITAL_PAD" ? " on the pad" : " from the uploaded scan"}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No signature captured yet
            {value.method === "DIGITAL_PAD"
              ? " — sign on the pad below."
              : " — upload a photo or scan of the signed form."}
          </p>
        )}
      </div>

      {value.method === "DIGITAL_PAD" ? (
        <section className="space-y-2">
          {showDisclaimer ? (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              Digital signature is for record-keeping only. Not legally binding without an
              audit-trailed e-signature provider.
            </p>
          ) : null}
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
          <Label>{uploadLabel}</Label>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={onScanFileChosen}
            className="block w-full text-sm"
          />
          <p className="text-xs text-muted-foreground">PNG or JPEG.</p>
          {value.scanDataUrl ? (
            <>
              <img
                src={value.scanDataUrl}
                alt="Uploaded signed consent"
                className="max-h-64 rounded-md border object-contain"
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="ghost" onClick={clearScan}>
                  Clear
                </Button>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function ConsentPanel({ client, onDone }: { client: DraftClient; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  // Two-stage preview-then-finalize state:
  //   capturedSignature stores the data URL once "Preview" succeeds, so
  //     "Finalize" doesn't ask the patient to sign again
  //   previewed flips true after the FO opens the preview blob so the
  //     "Finalize" button only shows up post-review
  const [capturedSignature, setCapturedSignature] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState(false);

  const [signature, setSignature] = useState<SignatureState>(EMPTY_SIGNATURE);

  // Guardian consent (for minors)
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [guardianSignature, setGuardianSignature] = useState<SignatureState>(EMPTY_SIGNATURE);

  const [downloadingConsent, setDownloadingConsent] = useState(false);

  // Compute if patient is a minor (age < 18)
  const isMinor = client.age !== null && client.age < 18;

  const method = signature.method;
  // Whichever method is selected, this is the signature that would be used.
  const activeSignature = activeSignatureOf(signature);
  const activeGuardianSignature = activeSignatureOf(guardianSignature);

  // Re-arming: the previewed-and-cached capture is only valid for the exact
  // signature it was made from, so switching method or clearing the pad forces
  // a fresh preview. This deliberately does NOT discard either method's
  // captured signature — only the preview cache.
  function rearm() {
    setCapturedSignature(null);
    setPreviewed(false);
  }

  // The rendered consent needs a persisted signature, which only exists after
  // finalize. window.open() would navigate a new tab straight into the route's
  // 422 JSON and show a blank page, reading as "the feature is broken" when
  // it's really just being used a step early — so fetch and surface the reason.
  async function downloadConsent() {
    setDownloadingConsent(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/consent-render`);
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't render the consent form." }),
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `consent-${client.firstName}-${client.lastName}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingConsent(false);
    }
  }

  function downloadTermsOfService() {
    window.open("/api/legal-documents/terms-of-service/download", "_blank");
  }

  function collectSignature(): string | null {
    if (client.intakeFormId == null) {
      toast.error(
        "This patient hasn't filled out the intake form yet. Capture it before saving consent.",
      );
      return null;
    }
    if (!activeSignature) {
      toast.error(
        method === "DIGITAL_PAD"
          ? "Have the patient sign on the pad"
          : "Upload the signed scan first",
      );
      return null;
    }
    return activeSignature;
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
          body: JSON.stringify({
            signatureDataUrl: dataUrl,
            method,
            ...(isMinor && activeGuardianSignature
              ? { guardianSignatureDataUrl: activeGuardianSignature }
              : {}),
          }),
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
    if (isMinor && !guardianConsent) {
      toast.error("Guardian consent must be confirmed for minors");
      return;
    }
    if (isMinor && !guardianName.trim()) {
      toast.error("Enter the guardian's name");
      return;
    }
    if (isMinor && !activeGuardianSignature) {
      toast.error("Capture the guardian's signature");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentMethod: method,
          signatureDataUrl: dataUrl,
          ...(isMinor && {
            guardianConsent,
            guardianName: guardianName.trim() || undefined,
            guardianRelationship: guardianRelationship.trim() || undefined,
            guardianSignatureDataUrl: activeGuardianSignature ?? undefined,
          }),
        }),
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => void downloadConsent()}
              disabled={!client.consentSigned || downloadingConsent}
              title={
                client.consentSigned
                  ? undefined
                  : "Finalize the patient's consent before downloading"
              }
            >
              {downloadingConsent ? "Preparing…" : "Download consent form (Word)"}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadTermsOfService}>
              Print full Terms of Service
            </Button>
          </div>
          {!client.consentSigned ? (
            <p className="w-full text-xs text-muted-foreground">
              The Word download includes the patient&apos;s signature, so it becomes available once
              consent is finalized below.
            </p>
          ) : null}
        </section>

        <section className="space-y-2">
          <Label>Patient&apos;s signature</Label>
          <SignatureCapture
            value={signature}
            onChange={setSignature}
            onRearm={rearm}
            showDisclaimer
            uploadLabel="Upload signed consent (photo or scan)"
          />
        </section>

        {/* Guardian consent for minors (age < 18) */}
        {isMinor ? (
          <section className="space-y-3 rounded-md border border-orange-200 bg-orange-50 p-3">
            <div className="flex items-start gap-2">
              <div className="text-xl font-semibold text-orange-900">⚠</div>
              <div>
                <p className="font-semibold text-orange-900">Patient is a minor — parental/guardian consent is required</p>
                <p className="mt-1 text-sm text-orange-800">
                  Patient is under 18 years old. Confirm that parental or guardian consent has been obtained before finalizing.
                </p>
              </div>
            </div>
            <div className="space-y-3 border-t border-orange-200 pt-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-orange-300 bg-white p-3 hover:bg-orange-50">
                <input
                  type="checkbox"
                  checked={guardianConsent}
                  onChange={(e) => setGuardianConsent(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-orange-900">
                  I have obtained consent from the patient&apos;s parent/guardian
                </span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="guardian-name" className="text-sm">
                    Guardian&apos;s full name
                  </Label>
                  <Input
                    id="guardian-name"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="e.g. Parent or legal guardian name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardian-relationship" className="text-sm">
                    Relationship to patient
                  </Label>
                  <Input
                    id="guardian-relationship"
                    value={guardianRelationship}
                    onChange={(e) => setGuardianRelationship(e.target.value)}
                    placeholder="e.g. Mother, Father, Guardian"
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-orange-300 bg-white p-3">
                <Label className="text-sm">Guardian&apos;s signature</Label>
                <SignatureCapture
                  value={guardianSignature}
                  onChange={setGuardianSignature}
                  onRearm={rearm}
                  uploadLabel="Upload the guardian's signed consent (photo or scan)"
                />
              </div>
            </div>
          </section>
        ) : null}

        {/* Two-stage flow per PRD §6.5 update:
            (1) FO clicks "Preview signed consent" — opens a new tab with
                the rendered DOCX containing the captured signature.
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
