"use client";

// Shared 2-page intake form used by:
//   - the public QR flow at /intake/[token] (PRD §4 A3, primary path)
//   - the FO "fill on behalf" panel inside /dashboard/assign (legacy chat:
//     "the intake form is the one which the front office is filling up").
//
// The shell owns the wizard, field rendering, page navigation, and validation;
// the consumer owns the network call and what happens after success. Required-
// field policy mirrors src/app/api/intake/[token]/submit/route.ts so server
// validation never disagrees with the UI.

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField, phoneNationalDigits, validatePhone } from "@/components/ui/phone-field";
import { DateField } from "@/components/ui/date-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SERVICE_CATEGORIES, type ServiceCategoryKey } from "@/lib/categories";
import { TermsModal } from "@/components/intake/terms-modal";

export type IntakeSex = "" | "M" | "F" | "OTHER";

export interface IntakeFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  sex: IntakeSex;
  occupation: string;
  sport: string;
  addressLine1: string;
  addressCity: string;
  addressPincode: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  selectedCategories: ServiceCategoryKey[];
  othersText: string;
  consent: boolean;
  liabilityWaiver: boolean;
  commercialTerms: boolean;
  cancellationPolicy: boolean;
  agreedToTerms: boolean;
}

export type IntakeFieldErrors = Partial<Record<keyof IntakeFormState, string>>;

export const INITIAL_INTAKE_FORM: IntakeFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dob: "",
  sex: "",
  occupation: "",
  sport: "",
  addressLine1: "",
  addressCity: "Mumbai",
  addressPincode: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
  selectedCategories: [],
  othersText: "",
  consent: false,
  liabilityWaiver: false,
  commercialTerms: false,
  cancellationPolicy: false,
  agreedToTerms: false,
};

export type IntakePayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  age?: number;
  sex: "M" | "F" | "OTHER";
  occupation?: string;
  sport?: string;
  addressLine1: string;
  addressCity: string;
  addressPincode: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  selectedCategories: ServiceCategoryKey[];
  othersText?: string;
  consent: true;
  liabilityWaiver: true;
  commercialTerms: true;
  cancellationPolicy: true;
  agreedToTerms: true;
};

type Page = 1 | 2;

function validatePage(form: IntakeFormState, page: Page): IntakeFieldErrors {
  const errs: IntakeFieldErrors = {};
  if (page === 1) {
    if (!form.firstName.trim()) errs.firstName = "First name is required.";
    if (!form.lastName.trim()) errs.lastName = "Surname is required.";
    if (!form.phone.trim()) errs.phone = "Phone is required.";
    else {
      const phoneErr = validatePhone(form.phone);
      if (phoneErr) errs.phone = phoneErr;
    }
    if (!form.email.trim()) errs.email = "Email is required.";
    // Stricter: require TLD of 2+ chars (rejects foo@bar, foo@bar.x).
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim().toLowerCase()))
      errs.email = "Enter a valid email address.";
    if (!form.dob) errs.dob = "Date of birth is required.";
    else {
      const d = new Date(form.dob);
      if (Number.isNaN(d.getTime()) || d > new Date())
        errs.dob = "Enter a valid date of birth.";
    }
    if (!form.sex) errs.sex = "Sex is required.";
    if (!form.addressLine1.trim()) errs.addressLine1 = "Address is required.";
    if (!form.addressCity.trim()) errs.addressCity = "City is required.";
    if (!form.addressPincode.trim()) errs.addressPincode = "Pincode is required.";
    else if (!/^\d{6}$/.test(form.addressPincode.trim()))
      errs.addressPincode = "Pincode must be 6 digits.";
    if (!form.emergencyName.trim())
      errs.emergencyName = "Emergency contact name is required.";
    if (!form.emergencyPhone.trim())
      errs.emergencyPhone = "Emergency contact phone is required.";
    else {
      const ePhoneErr = validatePhone(form.emergencyPhone);
      if (ePhoneErr) errs.emergencyPhone = ePhoneErr;
      // Emergency contact must be a different person — same-number bookings
      // tend to be a data-entry mistake (forgot to enter parent/spouse).
      else if (
        phoneNationalDigits(form.phone) !== "" &&
        phoneNationalDigits(form.phone) === phoneNationalDigits(form.emergencyPhone)
      )
        errs.emergencyPhone =
          "Emergency contact phone must be different from the patient's phone.";
    }
    if (!form.emergencyRelationship.trim())
      errs.emergencyRelationship = "Relationship is required.";
  }
  if (page === 2) {
    if (form.selectedCategories.length === 0)
      errs.selectedCategories = "Select at least one reason for the visit.";
    if (!form.consent) errs.consent = "Required to proceed.";
    if (!form.liabilityWaiver) errs.liabilityWaiver = "Required to proceed.";
    if (!form.commercialTerms) errs.commercialTerms = "Required to proceed.";
    if (!form.cancellationPolicy) errs.cancellationPolicy = "Required to proceed.";
    if (!form.agreedToTerms) errs.agreedToTerms = "Required to proceed.";
  }
  return errs;
}

function ageFromDob(dobStr: string): string {
  if (!dobStr) return "";
  const d = new Date(dobStr);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return String(Math.max(0, age));
}

function buildPayload(form: IntakeFormState, computedAge: string): IntakePayload {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    dob: form.dob,
    age: computedAge ? Number(computedAge) : undefined,
    sex: form.sex as "M" | "F" | "OTHER",
    occupation: form.occupation.trim() || undefined,
    sport: form.sport.trim() || undefined,
    addressLine1: form.addressLine1.trim(),
    addressCity: form.addressCity.trim(),
    addressPincode: form.addressPincode.trim(),
    emergencyName: form.emergencyName.trim(),
    emergencyPhone: form.emergencyPhone.trim(),
    emergencyRelationship: form.emergencyRelationship.trim(),
    selectedCategories: form.selectedCategories,
    othersText: form.othersText.trim() || undefined,
    consent: true,
    liabilityWaiver: true,
    commercialTerms: true,
    cancellationPolicy: true,
    agreedToTerms: true,
  };
}

interface IntakeFormShellProps {
  // Pre-fill known demographic fields (used by FO "on behalf" flow when the
  // Client already has firstName/phone etc).
  initial?: Partial<IntakeFormState>;
  // Whether to embed in a card-less inline layout (on-behalf mode) or the
  // full standalone page treatment (public token flow).
  variant?: "page" | "inline";
  submitLabel?: string;
  // Throws on failure; the shell catches and toasts.
  onSubmit: (payload: IntakePayload) => Promise<void>;
}

export function IntakeFormShell({
  initial,
  variant = "page",
  submitLabel = "Submit",
  onSubmit,
}: IntakeFormShellProps) {
  const [page, setPage] = useState<Page>(1);
  const [form, setForm] = useState<IntakeFormState>({
    ...INITIAL_INTAKE_FORM,
    ...(initial ?? {}),
  });
  const [errors, setErrors] = useState<IntakeFieldErrors>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [pending, setPending] = useState(false);

  const computedAge = useMemo(() => ageFromDob(form.dob), [form.dob]);

  function update<K extends keyof IntakeFormState>(key: K, value: IntakeFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (showAllErrors) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        const merged = { ...form, [key]: value };
        const fresh = validatePage(merged, page);
        if (fresh[key]) next[key] = fresh[key];
        return next;
      });
    }
  }

  function blur<K extends keyof IntakeFormState>(key: K) {
    const fresh = validatePage(form, page);
    setErrors((prev) => ({ ...prev, [key]: fresh[key] ?? "" }));
  }

  function toggleCategory(key: ServiceCategoryKey) {
    setForm((prev) => {
      const has = prev.selectedCategories.includes(key);
      return {
        ...prev,
        selectedCategories: has
          ? prev.selectedCategories.filter((k) => k !== key)
          : [...prev.selectedCategories, key],
      };
    });
    if (showAllErrors) {
      setErrors((prev) => ({ ...prev, selectedCategories: undefined }));
    }
  }

  function tryAdvance() {
    const errs = validatePage(form, 1);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      setShowAllErrors(true);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setShowAllErrors(false);
    setPage(2);
  }

  async function trySubmit() {
    const errsP1 = validatePage(form, 1);
    const errsP2 = validatePage(form, 2);
    const all = { ...errsP1, ...errsP2 };
    setErrors(all);
    if (Object.values(all).some(Boolean)) {
      setShowAllErrors(true);
      if (Object.values(errsP1).some(Boolean)) {
        setPage(1);
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
        toast.error("Some details on page 1 need attention.");
      } else {
        toast.error("Please complete all required fields.");
      }
      return;
    }
    setPending(true);
    try {
      await onSubmit(buildPayload(form, computedAge));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setPending(false);
    }
  }

  const body = (
    <>
      {page === 1 ? (
        <PageOne
          form={form}
          errors={errors}
          update={update}
          blur={blur}
          computedAge={computedAge}
        />
      ) : (
        <PageTwo
          form={form}
          errors={errors}
          update={update}
          toggleCategory={toggleCategory}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={page === 1}
          onClick={() => {
            setPage(1);
            if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
          }}
        >
          ← Back
        </Button>
        {page === 1 ? (
          <Button type="button" onClick={tryAdvance}>
            Next →
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={trySubmit}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        )}
      </div>
    </>
  );

  if (variant === "page") {
    return (
      <div className="min-h-screen bg-muted/30 p-4 md:p-8">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <header className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Movement By Design</h1>
            <p className="text-sm text-muted-foreground">Patient intake — Page {page} of 2</p>
          </header>
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Page {page} of 2</p>
      {body}
    </div>
  );
}

interface PageProps {
  form: IntakeFormState;
  errors: IntakeFieldErrors;
  update: <K extends keyof IntakeFormState>(key: K, value: IntakeFormState[K]) => void;
}

function PageOne({
  form,
  errors,
  update,
  blur,
  computedAge,
}: PageProps & {
  blur: <K extends keyof IntakeFormState>(key: K) => void;
  computedAge: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About the patient</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name *" error={errors.firstName}>
            <Input
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              onBlur={() => blur("firstName")}
              aria-invalid={Boolean(errors.firstName)}
              required
            />
          </Field>
          <Field label="Surname *" error={errors.lastName}>
            <Input
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              onBlur={() => blur("lastName")}
              aria-invalid={Boolean(errors.lastName)}
              required
            />
          </Field>
          <Field label="Phone *" error={errors.phone}>
            <PhoneField
              value={form.phone}
              onChange={(v) => update("phone", v)}
              onBlur={() => blur("phone")}
              invalid={Boolean(errors.phone)}
              required
            />
          </Field>
          <Field label="Email *" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              onBlur={() => blur("email")}
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
              required
            />
          </Field>
          <Field label="Date of birth *" error={errors.dob}>
            <DateField
              value={form.dob}
              onChange={(v) => {
                update("dob", v);
                blur("dob");
              }}
              max={new Date().toISOString().slice(0, 10)}
              invalid={Boolean(errors.dob)}
              required
            />
          </Field>
          <Field label="Age">
            <Input
              value={computedAge}
              readOnly
              tabIndex={-1}
              className="bg-muted/50 text-muted-foreground"
              aria-label="Age (derived from date of birth)"
            />
          </Field>
          <Field label="Sex *" error={errors.sex}>
            <select
              required
              value={form.sex}
              onChange={(e) => update("sex", e.target.value as IntakeFormState["sex"])}
              onBlur={() => blur("sex")}
              aria-invalid={Boolean(errors.sex)}
              className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm ${
                errors.sex ? "border-destructive" : "border-input"
              }`}
            >
              <option value="">Select…</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="OTHER">Prefer not to say / other</option>
            </select>
          </Field>
          <Field label="Occupation">
            <Input
              value={form.occupation}
              onChange={(e) => update("occupation", e.target.value)}
            />
          </Field>
          <Field label="Sport (if any)">
            <Input value={form.sport} onChange={(e) => update("sport", e.target.value)} />
          </Field>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Address *</p>
          <Field label="Line 1 *" error={errors.addressLine1}>
            <Input
              placeholder="Flat / building / street"
              value={form.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              onBlur={() => blur("addressLine1")}
              aria-invalid={Boolean(errors.addressLine1)}
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="City *" error={errors.addressCity}>
              <Input
                value={form.addressCity}
                onChange={(e) => update("addressCity", e.target.value)}
                onBlur={() => blur("addressCity")}
                aria-invalid={Boolean(errors.addressCity)}
                required
              />
            </Field>
            <Field label="Pincode *" error={errors.addressPincode}>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={form.addressPincode}
                onChange={(e) => update("addressPincode", e.target.value)}
                onBlur={() => blur("addressPincode")}
                aria-invalid={Boolean(errors.addressPincode)}
                required
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Emergency contact *</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name *" error={errors.emergencyName}>
              <Input
                value={form.emergencyName}
                onChange={(e) => update("emergencyName", e.target.value)}
                onBlur={() => blur("emergencyName")}
                aria-invalid={Boolean(errors.emergencyName)}
                required
              />
            </Field>
            <Field label="Phone *" error={errors.emergencyPhone}>
              <PhoneField
                value={form.emergencyPhone}
                onChange={(v) => update("emergencyPhone", v)}
                onBlur={() => blur("emergencyPhone")}
                invalid={Boolean(errors.emergencyPhone)}
                required
              />
            </Field>
            <Field label="Relationship *" error={errors.emergencyRelationship}>
              <Input
                value={form.emergencyRelationship}
                onChange={(e) => update("emergencyRelationship", e.target.value)}
                onBlur={() => blur("emergencyRelationship")}
                aria-invalid={Boolean(errors.emergencyRelationship)}
                placeholder="spouse, parent, etc."
                required
              />
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PageTwo({
  form,
  errors,
  update,
  toggleCategory,
}: PageProps & { toggleCategory: (k: ServiceCategoryKey) => void }) {
  const [termsOpen, setTermsOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>What brings them in?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Select all that apply. *</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SERVICE_CATEGORIES.map((c) => (
              <label
                key={c.key}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-input p-3 hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={form.selectedCategories.includes(c.key)}
                  onChange={() => toggleCategory(c.key)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
          {errors.selectedCategories ? (
            <p className="text-sm text-destructive">{errors.selectedCategories}</p>
          ) : null}
          <Field label="Anything else?">
            <Input
              value={form.othersText}
              onChange={(e) => update("othersText", e.target.value)}
              placeholder="Other concerns or context"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acknowledgements *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Please confirm the patient has read and accepts these terms. The full text is in the
            consent form they will sign at the front desk.
          </p>
          <Acknowledgement
            checked={form.consent}
            error={errors.consent}
            onChange={(v) => update("consent", v)}
            label="Patient confirms the information above is accurate and consents to MBD storing it for clinical and scheduling purposes."
          />
          <Acknowledgement
            checked={form.liabilityWaiver}
            error={errors.liabilityWaiver}
            onChange={(v) => update("liabilityWaiver", v)}
            label="Patient understands outcomes vary and MBD is not liable for unforeseen reactions arising from incomplete disclosure or non-compliance."
          />
          <Acknowledgement
            checked={form.commercialTerms}
            error={errors.commercialTerms}
            onChange={(v) => update("commercialTerms", v)}
            label="Patient has read the commercial terms — package validity, session pricing, payment timelines."
          />
          <Acknowledgement
            checked={form.cancellationPolicy}
            error={errors.cancellationPolicy}
            onChange={(v) => update("cancellationPolicy", v)}
            label="Patient acknowledges the cancellation policy: ≥4 hours' notice, or by 8 PM the previous day for morning slots."
          />
          {/* 5th ack — full T&C, opened in-place via the link. */}
          <div className="space-y-1">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent ${
                errors.agreedToTerms ? "border-destructive" : "border-input"
              }`}
            >
              <input
                type="checkbox"
                checked={form.agreedToTerms}
                onChange={(e) => update("agreedToTerms", e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm">
                I agree to the{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTermsOpen(true);
                  }}
                >
                  terms and conditions
                </button>
                .
              </span>
            </label>
            {errors.agreedToTerms ? (
              <p className="ml-6 text-xs text-destructive">{errors.agreedToTerms}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <TermsModal open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  // Labels ending in "*" indicate a required field. Mirror that onto the
  // first input/select inside via aria-required so screen readers announce
  // "required" instead of relying on the visual asterisk alone.
  // Reference: audit-2026-06-06 RR-UX-003 (Medium).
  const isRequired = /\*\s*$/.test(label);
  const decoratedChildren = isRequired
    ? React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ "aria-required"?: boolean }>, {
              "aria-required": true,
            })
          : child,
      )
    : children;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {decoratedChildren}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Acknowledgement({
  checked,
  error,
  onChange,
  label,
}: {
  checked: boolean;
  error?: string;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent ${
          error ? "border-destructive" : "border-input"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-sm">{label}</span>
      </label>
      {error ? <p className="ml-6 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
