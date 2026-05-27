"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
  // Legacy chat: FO fills the intake form on behalf when the patient didn't
  // come through the public QR link. PRD §4 A3 still keeps the QR path as
  // primary; this is the fallback so the consent step at the end of the
  // assign flow doesn't crash with `no_intake_form`.
  return d.intakeFormId == null ? "intake" : "assign";
}

export function AssignDashboard({ drafts, therapists, referralSources }: Props) {
  const [active, setActive] = useState<DraftClient | null>(drafts[0] ?? null);
  const [step, setStep] = useState<Step>(initialStepFor(drafts[0] ?? null));
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

  const matchingTherapists = useMemo(() => {
    if (eligibleDepartments.length === 0) return therapists;
    return therapists.filter(
      (t) => t.department && eligibleDepartments.includes(t.department),
    );
  }, [eligibleDepartments, therapists]);

  const [customerType, setCustomerType] = useState<"WALK_IN" | "BOOKING" | "REFERRAL">("WALK_IN");
  const [referralSourceId, setReferralSourceId] = useState<string>("");
  const [referredByName, setReferredByName] = useState("");
  const [comment, setComment] = useState("");
  const [selectedTherapists, setSelectedTherapists] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

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
          therapists: selectedTherapists.map((staffId, i) => ({
            staffId,
            isPrimary: i === 0,
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
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as typeof customerType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="WALK_IN">Walk-in</option>
              <option value="BOOKING">Pre-booking</option>
              <option value="REFERRAL">Referral</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Referral source</Label>
            <select
              value={referralSourceId}
              onChange={(e) => setReferralSourceId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">— none —</option>
              {referralSources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
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
            Filtered to {eligibleDepartments.length === 0 ? "all departments" : eligibleDepartments.join(" / ")}.
          </p>
          {matchingTherapists.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No matching staff. Pick therapists from the full list:
              <span className="ml-2">
                {therapists.slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTherapist(t.id)}
                    className="mr-1 rounded-md border px-2 py-1 text-xs"
                  >
                    {t.name}
                  </button>
                ))}
              </span>
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {matchingTherapists.map((t) => {
                // Surface why this therapist matches: their department maps
                // back to one or more categories the patient picked.
                const matchingCategories = categoriesForDepartment(t.department).filter(
                  (c) => client.selectedCategories.includes(c.key),
                );
                return (
                  <li key={t.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        selectedTherapists.includes(t.id)
                          ? "border-primary bg-secondary"
                          : "hover:bg-accent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTherapists.includes(t.id)}
                        onChange={() => toggleTherapist(t.id)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.designation ?? t.role} · {t.department ?? "—"}
                        </p>
                        {matchingCategories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {matchingCategories.map((c) => (
                              <Badge
                                key={c.key}
                                variant="success"
                                className="text-[10px]"
                                title={`Matches the patient's ${c.label} request`}
                              >
                                ✓ {c.label}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
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

  // Digital pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  // Scan upload
  const [scanDataUrl, setScanDataUrl] = useState<string | null>(null);

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
  }

  function downloadConsent(format: "docx" | "pdf") {
    const url = `/api/clients/${client.id}/consent-render?format=${format}`;
    window.open(url, "_blank");
  }

  async function onScanFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("File too large (max 4 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScanDataUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    // Client-side guard so a future caller that mounts ConsentPanel from
    // outside the assign flow gets a clear message instead of a 400 from
    // the server. The assign flow auto-routes to "intake" first now, so
    // this only fires if state somehow drifts.
    if (client.intakeFormId == null) {
      toast.error(
        "This patient hasn't filled out the intake form yet. Capture it before saving consent.",
      );
      return;
    }
    let dataUrl: string | null = null;
    if (method === "DIGITAL_PAD") {
      if (!padRef.current || padRef.current.isEmpty()) {
        toast.error("Have the patient sign on the pad");
        return;
      }
      dataUrl = padRef.current.toDataURL("image/png");
    } else {
      if (!scanDataUrl) {
        toast.error("Upload the signed scan first");
        return;
      }
      dataUrl = scanDataUrl;
    }

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
      toast.success("Consent captured. Patient is now ACTIVE.");
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
            onClick={() => setMethod("DIGITAL_PAD")}
          >
            Digital pad
          </Button>
          <Button
            type="button"
            variant={method === "PHYSICAL_SCAN" ? "default" : "outline"}
            onClick={() => setMethod("PHYSICAL_SCAN")}
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

        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save consent →"}
          </Button>
        </div>
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
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This walk-in didn&apos;t fill the QR form. Capture their intake here — they&apos;ll sign
          the consent at the end after you assign a therapist.
        </div>
        <IntakeFormShell
          variant="inline"
          submitLabel="Save intake →"
          initial={initial}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
}
