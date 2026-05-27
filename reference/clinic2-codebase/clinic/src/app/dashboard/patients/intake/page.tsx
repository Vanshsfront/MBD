"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronRight, ChevronLeft, Check, UserPlus, Loader2, ClipboardType, CheckCircle2, Building2, QrCode, Copy, ExternalLink, ArrowLeft, Heart, Printer, CalendarDays, ShieldAlert, FileCheck, Eye, X, Users } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import QRCode from "qrcode";
import { generateIntakePDF } from "@/lib/intake-pdf";
import { VISIT_REASON_OPTIONS } from "@/lib/validators";
import { THERAPIST_PALETTE, buildTherapistColorMap } from "@/lib/therapist-colors";

const STEPS = [
  { name: "About You", icon: UserPlus },
  { name: "What Brings You In", icon: Heart },
];

export default function IntakePage() {
  const { data: session } = useSession();
  const [intakeMode, setIntakeMode] = useState<"select" | "clinic" | "patient">("select");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Patient-side link state
  const [generatingLink, setGeneratingLink] = useState(false);
  const [patientLink, setPatientLink] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  // Demographics
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  // Visit Reasons (page 1)
  const [visitReasons, setVisitReasons] = useState<string[]>([]);

  // Removed Service Choices (moved to consultation phase)

  // Therapists for assignment
  interface TherapistItem { id: string; name: string; designation: string | null; role?: string; department?: { name: string } | null; }
  const [therapists, setTherapists] = useState<TherapistItem[]>([]);
  const [assignedTherapistIds, setAssignedTherapistIds] = useState<string[]>([]);

  // PDF viewer
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);

  // Validation errors
  const [phoneError, setPhoneError] = useState("");
  const [emergencyPhoneError, setEmergencyPhoneError] = useState("");
  const [ageError, setAgeError] = useState("");
  const [pincodeError, setPincodeError] = useState("");
  const [emailError, setEmailError] = useState("");

  // "Others" free-text for visit reasons
  const [othersText, setOthersText] = useState("");

  // Consent checkbox
  const [consentSigned, setConsentSigned] = useState(false);

  useEffect(() => {
    if (pincode && !/^\d{6}$/.test(pincode)) setPincodeError("Must be 6 digits");
    else setPincodeError("");
  }, [pincode]);

  const canProceedStep0 =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    /^\d{10}$/.test(phone) &&
    email.trim() !== "" && !emailError &&
    dob !== "" && !ageError &&
    addressLine1.trim() !== "" &&
    city.trim() !== "" &&
    /^\d{6}$/.test(pincode) &&
    emergencyName.trim() !== "" &&
    /^\d{10}$/.test(emergencyPhone);

  const canProceedStep1 = visitReasons.length > 0 && (visitReasons.includes("Others") ? othersText.trim() !== "" : true) && consentSigned;

  // Auto-calculate age from DOB
  useEffect(() => {
    if (dob) {
      const birthDate = new Date(dob);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) calculatedAge--;
      if (calculatedAge >= 0 && calculatedAge <= 100) {
        setAge(calculatedAge.toString());
        setAgeError("");
      } else {
        setAgeError("Age must be between 0 and 100");
      }
    }
  }, [dob]);

  // Phone validation
  useEffect(() => {
    if (phone && !/^\d{10}$/.test(phone)) {
      setPhoneError("Must be exactly 10 digits");
    } else {
      setPhoneError("");
    }
  }, [phone]);

  useEffect(() => {
    if (emergencyPhone && emergencyPhone !== "" && !/^\d{10}$/.test(emergencyPhone)) {
      setEmergencyPhoneError("Must be exactly 10 digits");
    } else {
      setEmergencyPhoneError("");
    }
  }, [emergencyPhone]);

  // Email validation
  useEffect(() => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address");
    } else if (!email) {
      setEmailError("Email is required");
    } else {
      setEmailError("");
    }
  }, [email]);

  // Fetch therapists for assignment
  useEffect(() => {
    fetch("/api/staff?active=true")
      .then(r => r.json())
      .then((data: TherapistItem[]) => {
        setTherapists(data.filter(t => t.role !== "FRONT_OFFICE" && t.role !== "DEV"));
      })
      .catch(() => {});
  }, []);

  const therapistColorMap = useMemo(() => buildTherapistColorMap(therapists), [therapists]);

  const assignedTherapists = useMemo(
    () => therapists.filter(t => assignedTherapistIds.includes(t.id)),
    [therapists, assignedTherapistIds]
  );

  const toggleTherapist = (id: string) => {
    setAssignedTherapistIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleVisitReason = (reason: string) => {
    setVisitReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = async () => {
    if (!consentSigned) {
      toast.error("Please acknowledge the consent and terms");
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        client: {
          firstName, lastName, phone, email,
          dob: dob || undefined,
          age: age ? parseInt(age) : undefined,
          sex: sex || undefined,
          address: (addressLine1 || city) ? { line1: addressLine1, line2: addressLine2, city, pincode } : undefined,
          emergencyContact: emergencyName ? { name: emergencyName, phone: emergencyPhone } : undefined,
          visitReasons: visitReasons.length > 0 ? visitReasons : undefined,
          othersText: othersText || undefined,
        },
        intake: {
          selectedServices: [],
          consentSigned: consentSigned,
          liabilityWaiverSigned: consentSigned,
          commercialTermsAccepted: consentSigned,
          cancellationPolicyAcknowledged: consentSigned,
          visitDateTime: new Date().toISOString(),
          othersText: othersText || undefined,
        },
        status: "DRAFT",
        frontOfficeExec: (session?.user as { id?: string })?.id || undefined,
        performedById: (session?.user as { id?: string })?.id || undefined,
      };

      const res = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit intake");
      }

      const data = await res.json();
      setSubmitted(true);
      toast.success(`Patient ${data.clientCode} registered successfully!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register patient");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generatePatientLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/intake-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdById: (session?.user as { id?: string })?.id }),
      });
      if (!res.ok) throw new Error("Failed to generate link");
      const data = await res.json();
      // API already returns a full URL (e.g. http://localhost:3000/intake/<token>).
      // Don't prepend window.location.origin — that produced "localhost:3000localhost:3000/intake/...".
      const fullLink: string = data.url;
      setPatientLink(fullLink);

      const qrDataUrl = await QRCode.toDataURL(fullLink, {
        width: 280,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      });
      setQrCodeDataUrl(qrDataUrl);
      setIntakeMode("patient");
      toast.success("Patient intake link generated!");
    } catch {
      toast.error("Failed to generate intake link");
    } finally {
      setGeneratingLink(false);
    }
  };

  // Mode selector screen
  if (intakeMode === "select") {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-12 w-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
              <ClipboardType className="h-8 w-8 text-blue-600" /> Client Intake
            </h1>
            <p className="text-text-tertiary font-medium">Choose how to register the new client.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setIntakeMode("clinic")}
            className="bg-surface rounded-2xl border-2 border-border-light shadow-sm p-8 text-left group hover:border-blue-400 hover:shadow-md transition-all duration-300 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-blue-50 -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-100 transition-colors" />
            <div className="relative">
              <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-5 group-hover:bg-blue-100 group-hover:border-blue-200 transition-all">
                <Building2 className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Fill at Clinic</h3>
              <p className="text-sm text-text-tertiary leading-relaxed mb-4">
                Staff fills the intake form on the clinic&apos;s system. Best for walk-in registrations.
              </p>
              <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm group-hover:gap-3 transition-all">
                Open Form <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </button>

          <button
            onClick={generatePatientLink}
            disabled={generatingLink}
            className="bg-surface rounded-2xl border-2 border-border-light shadow-sm p-8 text-left group hover:border-green-400 hover:shadow-md transition-all duration-300 relative overflow-hidden disabled:opacity-70"
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-green-50 -translate-y-1/2 translate-x-1/2 group-hover:bg-green-100 transition-colors" />
            <div className="relative">
              <div className="w-14 h-14 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center mb-5 group-hover:bg-green-100 group-hover:border-green-200 transition-all">
                {generatingLink ? <Loader2 className="h-7 w-7 text-green-600 animate-spin" /> : <QrCode className="h-7 w-7 text-green-600" />}
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Send to Patient</h3>
              <p className="text-sm text-text-tertiary leading-relaxed mb-4">
                Generate a link &amp; QR code for the patient to fill the form on their own device.
              </p>
              <div className="flex items-center gap-2 text-green-600 font-semibold text-sm group-hover:gap-3 transition-all">
                {generatingLink ? "Generating..." : "Generate Link"} <ExternalLink className="h-4 w-4" />
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Patient-side link + QR display
  if (intakeMode === "patient") {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-12 w-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
              <QrCode className="h-8 w-8 text-green-600" /> Patient Intake Link
            </h1>
            <p className="text-text-tertiary font-medium">Share this link or QR code with the patient.</p>
          </div>
          <Button variant="outline" onClick={() => { setIntakeMode("select"); setPatientLink(""); setQrCodeDataUrl(""); }}
            className="border-border-light text-text-secondary hover:bg-surface-secondary">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>

        <div className="bg-surface rounded-2xl border border-border-light shadow-sm overflow-hidden">
          <div className="bg-green-50 px-8 py-6 border-b border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface border border-green-200 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-900">Link Ready</h3>
                <p className="text-xs text-green-700 font-medium">Valid for 48 hours from now</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="flex flex-col items-center">
                <div className="bg-surface border-2 border-border-light rounded-2xl p-4 shadow-sm">
                  {qrCodeDataUrl && (
                    <img src={qrCodeDataUrl} alt="QR Code for patient intake" width={280} height={280} className="rounded-lg" />
                  )}
                </div>
                <p className="text-xs text-text-tertiary font-medium mt-4 text-center">Ask the patient to scan this QR code with their phone camera</p>
              </div>

              <div className="space-y-6">
                <div>
                  <Label className="text-xs font-semibold text-text-secondary mb-2 block">Shareable Link</Label>
                  <div className="flex gap-2">
                    <Input value={patientLink} readOnly className="bg-surface-secondary border-border-light text-text-primary font-mono text-xs h-11 flex-1" />
                    <Button onClick={() => { navigator.clipboard.writeText(patientLink); toast.success("Link copied to clipboard!"); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-11 px-4 shrink-0">
                      <Copy className="h-4 w-4 mr-2" /> Copy
                    </Button>
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-xl p-5 border border-border-light space-y-3">
                  <h4 className="text-sm font-bold text-text-primary">How it works</h4>
                  <ol className="space-y-2">
                    {[
                      "Patient opens the link on their phone or scans the QR code",
                      "They fill out personal details and reason for visit",
                      "Once submitted, a notification pops up on the assignment page",
                      "Front office completes service selection, prints the form, and assigns a therapist",
                    ].map((text, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-text-secondary">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        {text}
                      </li>
                    ))}
                  </ol>
                </div>

                <Button onClick={generatePatientLink} variant="outline" disabled={generatingLink}
                  className="w-full border-border-light text-text-secondary hover:bg-surface-secondary h-11">
                  {generatingLink ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                  Generate New Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] relative pt-12">
        <div className="bg-surface border border-border-light shadow-sm rounded-2xl p-10 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center border border-green-100 mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-2">Registration Complete</h2>
          <p className="text-text-tertiary text-sm mb-8 leading-relaxed">The client has been registered successfully. They will appear in the Pending Allocations queue.</p>
          <Button onClick={() => { window.location.reload(); }} className="w-full bg-text-primary hover:opacity-90 text-white font-semibold text-sm h-11 rounded-md transition-all">
            <UserPlus className="h-4 w-4 mr-2" /> Start Next Intake
          </Button>
        </div>
      </div>
    );
  }

  const CurrentStepIcon = STEPS[step].icon;
  const visitDateTime = new Date();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
             <ClipboardType className="h-8 w-8 text-blue-600" /> Client Intake
          </h1>
          <p className="text-text-tertiary font-medium">Register new clients and capture essential details.</p>
        </div>
        <Button variant="outline" onClick={() => { setIntakeMode("select"); setStep(0); }}
          className="border-border-light text-text-secondary hover:bg-surface-secondary">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-bold mb-1">Disclaimer — please read to the patient</p>
          <p>By submitting this form, the patient confirms that the information provided is accurate and consents to MBD using it for appointment scheduling, clinical assessment, and care delivery. Services may include physiotherapy, massage, yoga, nutrition, counselling, and wellness consultations — outcomes vary by individual and no specific result is guaranteed. Information is kept confidential. Full informed consent and clinic policies are signed on the printed form.</p>
        </div>
      </div>

      {/* Visit Date/Time Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
        <CalendarDays className="h-5 w-5 text-blue-600 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Visit Date & Time</p>
          <p className="text-sm font-bold text-blue-900">
            {visitDateTime.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {" at "}
            {visitDateTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Progress Navigator */}
      <div className="neumorphic-card overflow-hidden p-2">
        <div className="flex items-center justify-between px-2">
          {STEPS.map((s, i) => {
             const Icon = s.icon;
             return (
              <div key={s.name} className="flex items-center flex-1">
                 <button
                   onClick={() => setStep(i)}
                   className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 w-full ${
                     i === step ? "bg-blue-50 border border-blue-100 text-blue-700" :
                     "bg-transparent text-text-secondary hover:bg-surface-secondary cursor-pointer"
                   }`}
                 >
                   <div className={`size-8 rounded-md flex items-center justify-center shrink-0 ${
                     i < step ? "bg-blue-600 text-white" : i === step ? "bg-blue-100 text-blue-700" : "bg-surface-secondary text-text-tertiary"
                   }`}>
                     {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                   </div>
                   <div className="text-left">
                     <p className={`text-[10px] font-bold uppercase tracking-wider ${i === step ? "text-blue-500" : "text-text-tertiary"}`}>Step 0{i+1}</p>
                     <p className={`text-sm font-semibold ${i === step ? "text-blue-800" : "text-text-secondary"}`}>{s.name}</p>
                   </div>
                 </button>
                 {i < STEPS.length - 1 && <div className="flex-1 min-w-[20px] h-px mx-2 bg-border-light"></div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-surface rounded-xl border border-border-light shadow-sm relative overflow-hidden">
        <div className="bg-surface-secondary px-8 py-6 border-b border-border-light flex items-center gap-4">
           <div className="size-12 rounded-lg bg-surface border border-border-light flex items-center justify-center shadow-sm text-blue-600">
              <CurrentStepIcon className="h-6 w-6" />
           </div>
           <div>
              <h3 className="text-xl font-bold text-text-primary tracking-tight">{STEPS[step].name}</h3>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mt-1">Step {step + 1} of {STEPS.length}</p>
           </div>
        </div>

        <div className="p-8">
          {/* Step 0: About You & Your Visit */}
          {step === 0 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-text-secondary">First Name <span className="text-red-500">*</span></Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Enter first name" className="bg-surface border-border-light text-text-primary h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-text-secondary">Last Name <span className="text-red-500">*</span></Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Enter last name" className="bg-surface border-border-light text-text-primary h-11" />
                </div>
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-text-secondary">Mobile Number <span className="text-red-500">*</span></Label>
                  <div className="flex">
                    <div className="flex items-center px-3 bg-surface-secondary border border-r-0 border-border-light rounded-l-md text-sm font-semibold text-text-secondary">
                      +91
                    </div>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile number"
                      className={`bg-surface text-text-primary h-11 font-mono rounded-l-none ${phoneError ? "border-red-300" : "border-border-light"}`}
                    />
                  </div>
                  {phoneError && <p className="text-xs text-red-500 font-medium">{phoneError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-text-secondary">Email Address <span className="text-red-500">*</span></Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email" className={`bg-surface text-text-primary h-11 ${emailError && email ? "border-red-300" : "border-border-light"}`} />
                  {emailError && email && <p className="text-xs text-red-500 font-medium">{emailError}</p>}
                </div>
              </div>

              {/* DOB, Age, Sex — aligned in one row */}
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                <h4 className="text-sm font-bold text-blue-900 mb-4">
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-bold mr-2">REQUIRED</span>
                  Date of Birth & Demographics
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_1.5fr] gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-blue-800">Date of Birth <span className="text-red-500">*</span></Label>
                    <Input value={dob} onChange={(e) => setDob(e.target.value)} type="date" className="bg-surface border-blue-200 text-text-primary h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-blue-800">Age</Label>
                    <Input value={age} readOnly placeholder="Auto" className="bg-surface-secondary border-blue-200 text-text-primary h-11 font-bold text-center cursor-not-allowed px-2" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-blue-800">Sex</Label>
                    <div className="flex items-center gap-2">
                       {["Male", "Female", "Other"].map((opt) => (
                         <button
                           key={opt}
                           onClick={() => setSex(opt)}
                           className={`h-11 flex-1 rounded-lg text-sm font-medium border transition-all ${
                             sex === opt ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-surface text-text-secondary border-blue-200 hover:border-blue-400"
                           }`}
                         >
                           {opt}
                         </button>
                       ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="border-t border-border-light pt-6">
                <h4 className="text-sm font-bold text-text-primary mb-3">Address <span className="text-red-500">*</span></h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address Line 1 *" className="bg-surface border-border-light text-text-primary h-11" />
                  <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Address Line 2 (Optional)" className="bg-surface border-border-light text-text-primary h-11" />
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / District *" className="bg-surface border-border-light text-text-primary h-11" />
                  <div className="space-y-1.5">
                    <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Pincode (6 digits) *" className={`bg-surface text-text-primary h-11 ${pincodeError ? "border-red-300" : "border-border-light"}`} />
                    {pincodeError && <p className="text-xs text-red-500 font-medium">{pincodeError}</p>}
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="border-t border-border-light pt-6">
                <h4 className="text-sm font-bold text-text-primary mb-3">Emergency Contact <span className="text-red-500">*</span></h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-text-secondary">Contact Name <span className="text-red-500">*</span></Label>
                    <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Full Name" className="bg-surface border-border-light text-text-primary h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-text-secondary">Contact Number <span className="text-red-500">*</span></Label>
                    <div className="flex">
                      <div className="flex items-center px-3 bg-surface-secondary border border-r-0 border-border-light rounded-l-md text-sm font-semibold text-text-secondary">
                        +91
                      </div>
                      <Input
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="10-digit number"
                        className={`bg-surface text-text-primary h-11 font-mono rounded-l-none ${emergencyPhoneError ? "border-red-300" : "border-border-light"}`}
                      />
                    </div>
                    {emergencyPhoneError && <p className="text-xs text-red-500 font-medium">{emergencyPhoneError}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: What Brings You to MBD */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <h4 className="text-sm font-bold text-text-primary mb-1">What Brings You to MBD? <span className="text-red-500">*</span></h4>
              <p className="text-xs text-text-tertiary mb-4">Select all that apply. This helps us prepare for your visit.</p>
              {visitReasons.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-blue-900">Selected</span>
                  <Badge className="bg-blue-600 text-white border-0 text-xs px-2">{visitReasons.length} SELECTED</Badge>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {VISIT_REASON_OPTIONS.map((reason) => {
                  const isSelected = visitReasons.includes(reason);
                  return (
                    <button key={reason} onClick={() => toggleVisitReason(reason)}
                      className={`flex items-center gap-3 rounded-xl p-3.5 text-left transition-all border ${
                        isSelected ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "bg-surface border-border-light hover:border-blue-300"
                      }`}>
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-blue-600" : "border border-border-light bg-surface"
                      }`}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className={`text-sm font-medium ${isSelected ? "text-blue-900" : "text-text-secondary"}`}>{reason}</span>
                    </button>
                  );
                })}
              </div>

              {/* Others text field — shown when "Others" is selected */}
              {visitReasons.includes("Others") && (
                <div className="mt-4 space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <Label className="text-xs font-semibold text-amber-800">Please specify <span className="text-red-500">*</span></Label>
                  <Input
                    value={othersText}
                    onChange={(e) => setOthersText(e.target.value)}
                    placeholder="Describe your reason for visiting MBD..."
                    className="bg-surface border-amber-200 text-text-primary h-11"
                  />
                </div>
              )}
                {/* Consent Accordion inside Step 1 */}
                <div className="mt-8 border-t border-border-light pt-6">
                  <div className="bg-surface-secondary border border-border-light rounded-xl overflow-hidden">
                    <details className="group">
                      <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface transition-colors select-none">
                        <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-blue-600" />
                          Read Informed Consent &amp; Clinic Policies
                        </h4>
                        <ChevronRight className="h-4 w-4 text-text-tertiary group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="p-5 border-t border-border-light bg-surface space-y-5">
                        <div>
                          <h5 className="text-xs font-bold text-text-primary mb-2 uppercase tracking-wider">Informed Consent</h5>
                          <div className="text-xs text-text-secondary leading-relaxed space-y-2">
                            <p>I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge. I voluntarily consent to the collection, storage, and use of my personal and health information for the purposes of appointment scheduling, clinical assessment, and the provision of healthcare services. I understand that my information will be kept confidential and handled securely in accordance with applicable privacy and data protection regulations by Team MBD.</p>
                            <p>I understand that services at MBD include, but are not limited to, physiotherapy, strength &amp; conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness. I acknowledge that outcomes may vary between individuals and that no guarantee of specific results has been promised.</p>
                            <p>I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions.</p>
                          </div>
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-text-primary mb-2 uppercase tracking-wider">Terms &amp; Clinic Policies</h5>
                          <div className="text-xs text-text-secondary leading-relaxed space-y-2">
                            <p>I understand that packages and services have defined durations and validity periods as explained to me. I understand that in accordance with the cancellation policy:</p>
                            <ul className="list-disc pl-5 space-y-1">
                              <li>Appointments must be cancelled at least 4 hours in advance.</li>
                              <li>For pre-noon appointments, cancellations must be informed before 08:00 PM the previous day.</li>
                              <li>Late cancellations or no-shows may result in session deduction.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>

                  <button
                    onClick={() => setConsentSigned(!consentSigned)}
                    className={`mt-4 flex items-start gap-3 w-full rounded-xl p-4 text-left transition-all border ${
                      consentSigned ? "bg-green-50 border-green-500 ring-1 ring-green-500" : "bg-surface border-border-light hover:border-green-300"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      consentSigned ? "bg-green-600" : "border border-border-light bg-surface"
                    }`}>
                      {consentSigned && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <span className={`text-sm leading-relaxed ${consentSigned ? "text-green-900 font-medium" : "text-text-secondary"}`}>
                      I have read and agree to the Informed Consent and Clinic Policies.
                    </span>
                  </button>
                </div>

                {/* Therapist Assignment */}
                <div className="mt-8 border-t border-border-light pt-6">
                  <h4 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-blue-600" />
                    Assign Therapist(s)
                  </h4>
                  <p className="text-xs text-text-tertiary mb-3">Select the therapist(s) who will be working with this patient. This will appear on the printed form.</p>

                  {assignedTherapistIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {assignedTherapists.map(t => {
                        const c = therapistColorMap.get(t.id);
                        return (
                          <Badge key={t.id}
                            className={`${c?.badge || ""} border text-xs font-semibold cursor-pointer hover:opacity-80`}
                            onClick={() => toggleTherapist(t.id)}
                          >
                            {t.name} ✕
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {therapists.map((t) => {
                      const isAssigned = assignedTherapistIds.includes(t.id);
                      const c = therapistColorMap.get(t.id);
                      return (
                        <button key={t.id} onClick={() => toggleTherapist(t.id)}
                          className="flex items-center gap-3 rounded-lg p-2.5 text-left transition-all border text-sm"
                          style={{
                            backgroundColor: isAssigned ? c?.bg : undefined,
                            borderColor: isAssigned ? c?.border : undefined,
                            color: isAssigned ? c?.text : undefined,
                          }}
                        >
                          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: isAssigned ? c?.border : "transparent",
                              border: isAssigned ? "none" : "1.5px solid #cbd5e1",
                            }}
                          >
                            {isAssigned && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold">{t.name}</span>
                            {t.department?.name && (
                              <span className="text-xs opacity-70 ml-1.5">— {t.department.name}</span>
                            )}
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c?.border }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Navigation Footer */}
        <div className="bg-surface-secondary px-8 py-5 border-t border-border-light flex flex-col md:flex-row items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="text-text-secondary hover:text-text-primary hover:bg-surface-secondary font-semibold px-4 disabled:opacity-40 w-full md:w-auto justify-start md:justify-center"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 0 && !canProceedStep0) || (step === 1 && !canProceedStep1)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 h-10 shadow-sm transition-all w-full md:w-auto disabled:opacity-50"
            >
              Next Step <ChevronRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  const dataUrl = generateIntakePDF({
                    firstName, lastName, phone, email, dob, age, sex, dominance: "",
                    addressLine1, addressLine2, city, pincode,
                    emergencyName, emergencyPhone, referredBy: "",
                    selectedServiceNames: [],
                    chiefComplaints: "", knownAllergies: "", currentMedications: "", pastMedicalHistory: "",
                    visitReasons,
                    visitDateTime: new Date().toISOString(),
                    othersText,
                    consentAssess: consentSigned,
                    consentTerms: consentSigned,
                    assignedTherapists: assignedTherapists.map(t => ({ name: t.name })),
                  });
                  setPdfDataUrl(dataUrl);
                  setPdfViewerOpen(true);
                }}
                className="border-border-light text-text-secondary hover:bg-surface-secondary font-semibold text-sm px-5 h-10 w-full md:w-auto"
              >
                <Eye className="h-4 w-4 mr-2" /> Preview PDF
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || !canProceedStep1}
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-6 h-10 shadow-sm transition-all disabled:opacity-50 w-full md:w-auto"
              >
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering...</> : <><UserPlus className="h-4 w-4 mr-2" /> Complete Registration</>}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* PDF Viewer Dialog */}
      <Dialog open={pdfViewerOpen} onOpenChange={setPdfViewerOpen}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-light bg-surface-secondary">
            <DialogTitle className="text-sm font-bold text-text-primary">Intake Form Preview</DialogTitle>
            <div className="flex items-center gap-2">
              {pdfDataUrl && (
                <Button variant="outline" size="sm" className="text-xs h-8"
                  onClick={() => window.open(pdfDataUrl, "_blank")}
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> Print / Download
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setPdfViewerOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {pdfDataUrl && (
            <iframe
              src={pdfDataUrl}
              className="w-full flex-1"
              title="Intake PDF Preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
