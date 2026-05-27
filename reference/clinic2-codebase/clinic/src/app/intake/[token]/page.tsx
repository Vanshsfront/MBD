"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, ChevronLeft, Check, UserPlus, Loader2, ClipboardType, CheckCircle2, Heart, ShieldAlert, CalendarDays, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { VISIT_REASON_OPTIONS } from "@/lib/validators";

const STEPS = [
  { name: "About You", icon: UserPlus },
  { name: "What Brings You In", icon: Heart },
];

export default function PatientIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [clientCode, setClientCode] = useState("");

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

  // Visit Reasons (now on page 1)
  const [visitReasons, setVisitReasons] = useState<string[]>([]);

  // Visit date/time (auto-filled)
  const visitDateTime = new Date();

  // Validation errors
  const [phoneError, setPhoneError] = useState("");
  const [emergencyPhoneError, setEmergencyPhoneError] = useState("");
  const [ageError, setAgeError] = useState("");
  const [pincodeError, setPincodeError] = useState("");
  const [emailError, setEmailError] = useState("");

  const [othersText, setOthersText] = useState("");
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

  useEffect(() => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address");
    } else if (!email) {
      setEmailError("Email is required");
    } else {
      setEmailError("");
    }
  }, [email]);

  // Validate token on load
  useEffect(() => {
    fetch(`/api/intake-token/${resolvedParams.token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Invalid intake link");
        }
        return res.json();
      })
      .then(() => {
        // Token is valid
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resolvedParams.token]);

  const toggleVisitReason = (reason: string) => {
    setVisitReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        client: {
          firstName,
          lastName,
          phone,
          email: email || undefined,
          dob: dob || undefined,
          age: age ? parseInt(age) : undefined,
          sex: sex || undefined,
          address: (addressLine1 || city) ? { line1: addressLine1, line2: addressLine2, city, pincode } : undefined,
          emergencyContact: emergencyName ? { name: emergencyName, phone: emergencyPhone } : undefined,
          visitReasons,
          othersText: othersText || undefined,
          consentSigned,
          selectedServices: [],
        },
      };

      const res = await fetch(`/api/intake-token/${resolvedParams.token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Submission failed");
      }

      const data = await res.json();
      setClientCode(data.clientCode);
      setSubmitted(true);
      toast.success("Registration complete!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-slate-500 font-medium text-sm">Validating your intake link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border border-red-100 mb-6">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Link Unavailable</h2>
          <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
          <p className="text-slate-400 text-xs mt-4">Please contact the clinic to request a new intake link.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center border border-green-100 mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Registration Complete</h2>
          <p className="text-slate-500 text-sm mb-4 leading-relaxed">
            Thank you, <strong>{firstName} {lastName}</strong>! Your registration has been submitted successfully.
          </p>
          {clientCode && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">Your Patient Code</p>
              <p className="text-2xl font-black text-blue-900 tracking-wider">{clientCode}</p>
            </div>
          )}
          <p className="text-slate-400 text-xs">You may now close this page. The front desk will assist you shortly.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-medium mt-6">
            <Heart className="h-3.5 w-3.5 text-rose-400" />
            Powered by Movement by Design
          </div>
        </div>
      </div>
    );
  }

  const CurrentStepIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-200">
                <ClipboardType className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">Patient Intake Form</h1>
                <p className="text-xs text-slate-500 font-medium">Please complete all required fields below</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Heart className="h-3.5 w-3.5 text-rose-400" />
              Movement by Design
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-1">Please read before signing up</p>
            <p>By submitting this form, you confirm that the information you provide is accurate and consent to Movement By Design (MBD) using it for appointment scheduling, clinical assessment, and care delivery. Services may include physiotherapy, massage, yoga, nutrition, counselling, and wellness consultations — outcomes vary by individual and no specific result is guaranteed. Your information will be kept confidential. Full informed consent and clinic policies will be presented to you at the clinic for your signature.</p>
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

        {/* Progress bar */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="flex items-center flex-1">
                  <div className={`flex items-center gap-2 ${i <= step ? "text-blue-700" : "text-slate-400"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i < step ? "bg-blue-600 text-white" : i === step ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-slate-100 text-slate-400"
                    }`}>
                      {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-xs font-semibold hidden sm:inline ${i === step ? "text-blue-700" : i < step ? "text-slate-600" : "text-slate-400"}`}>{s.name}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${i < step ? "bg-blue-300" : "bg-slate-200"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm text-blue-600">
              <CurrentStepIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{STEPS[step].name}</h3>
              <p className="text-xs text-slate-500 font-medium">Step {step + 1} of {STEPS.length}</p>
            </div>
          </div>

          <div className="p-6">
            {/* Step 0: Personal Details + What Brings You to MBD */}
            {step === 0 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">First Name <span className="text-red-500">*</span></Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Enter first name" className="bg-white border-slate-200 text-slate-900 h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Last Name <span className="text-red-500">*</span></Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Enter last name" className="bg-white border-slate-200 text-slate-900 h-11" />
                  </div>
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Mobile Number <span className="text-red-500">*</span></Label>
                    <div className="flex">
                      <div className="flex items-center px-3 bg-slate-100 border border-r-0 border-slate-200 rounded-l-md text-sm font-semibold text-slate-600">
                        +91
                      </div>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="10-digit mobile number"
                        className={`bg-white text-slate-900 h-11 font-mono rounded-l-none ${phoneError ? "border-red-300" : "border-slate-200"}`}
                      />
                    </div>
                    {phoneError && <p className="text-xs text-red-500 font-medium">{phoneError}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Email Address <span className="text-red-500">*</span></Label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email" className={`bg-white text-slate-900 h-11 ${emailError ? "border-red-300" : "border-slate-200"}`} />
                    {emailError && <p className="text-xs text-red-500 font-medium">{emailError}</p>}
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
                      <Input value={dob} onChange={(e) => setDob(e.target.value)} type="date" className="bg-white border-blue-200 text-slate-900 h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-blue-800">Age</Label>
                      <Input value={age} readOnly placeholder="Auto" className="bg-slate-50 border-blue-200 text-slate-900 h-11 font-bold text-center cursor-not-allowed px-2" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-blue-800">Sex</Label>
                      <div className="flex items-center gap-2">
                         {["Male", "Female", "Other"].map((opt) => (
                           <button
                             key={opt}
                             onClick={(e) => { e.preventDefault(); setSex(opt); }}
                             className={`h-11 flex-1 rounded-lg text-sm font-medium border transition-all ${
                               sex === opt ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-700 border-blue-200 hover:border-blue-400"
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
                <div className="border-t border-slate-200 pt-6">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">Address <span className="text-red-500">*</span></h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address Line 1 *" className="bg-white border-slate-200 text-slate-900 h-11" />
                    <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Address Line 2 (Optional)" className="bg-white border-slate-200 text-slate-900 h-11" />
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / District *" className="bg-white border-slate-200 text-slate-900 h-11" />
                    <div className="space-y-1.5">
                      <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Pincode (6 digits) *" className={`bg-white text-slate-900 h-11 ${pincodeError ? "border-red-300" : "border-slate-200"}`} />
                      {pincodeError && <p className="text-xs text-red-500 font-medium">{pincodeError}</p>}
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="border-t border-slate-200 pt-6">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">Emergency Contact <span className="text-red-500">*</span></h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">Contact Name <span className="text-red-500">*</span></Label>
                      <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Full Name" className="bg-white border-slate-200 text-slate-900 h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">Contact Number <span className="text-red-500">*</span></Label>
                      <div className="flex">
                        <div className="flex items-center px-3 bg-slate-100 border border-r-0 border-slate-200 rounded-l-md text-sm font-semibold text-slate-600">
                          +91
                        </div>
                        <Input
                          value={emergencyPhone}
                          onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="10-digit number"
                          className={`bg-white text-slate-900 h-11 font-mono rounded-l-none ${emergencyPhoneError ? "border-red-300" : "border-slate-200"}`}
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
                <h4 className="text-sm font-bold text-slate-900 mb-1">What Brings You to MBD? <span className="text-red-500">*</span></h4>
                <p className="text-xs text-slate-500 mb-4">Select all that apply. This helps us prepare for your visit.</p>
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
                          isSelected ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "bg-white border-slate-200 hover:border-blue-300"
                        }`}>
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          isSelected ? "bg-blue-600" : "border border-slate-300 bg-white"
                        }`}>
                          {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <span className={`text-sm font-medium ${isSelected ? "text-blue-900" : "text-slate-700"}`}>{reason}</span>
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
                      className="bg-white border-amber-200 text-slate-900 h-11"
                    />
                  </div>
                )}

                {/* Consent Accordion inside Step 1 */}
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                    <details className="group">
                      <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-blue-600" />
                          Read Informed Consent &amp; Clinic Policies
                        </h4>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="p-5 border-t border-slate-200 bg-white space-y-5">
                        <div>
                          <h5 className="text-xs font-bold text-slate-900 mb-2 uppercase tracking-wider">Informed Consent</h5>
                          <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                            <p>I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge. I voluntarily consent to the collection, storage, and use of my personal and health information for the purposes of appointment scheduling, clinical assessment, and the provision of healthcare services. I understand that my information will be kept confidential and handled securely in accordance with applicable privacy and data protection regulations by Team MBD.</p>
                            <p>I understand that services at MBD include, but are not limited to, physiotherapy, strength &amp; conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness. I acknowledge that outcomes may vary between individuals and that no guarantee of specific results has been promised.</p>
                            <p>I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions.</p>
                          </div>
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-slate-900 mb-2 uppercase tracking-wider">Terms &amp; Clinic Policies</h5>
                          <div className="text-xs text-slate-600 leading-relaxed space-y-2">
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
                      consentSigned ? "bg-green-50 border-green-500 ring-1 ring-green-500" : "bg-white border-slate-200 hover:border-green-300"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      consentSigned ? "bg-green-600" : "border border-slate-200 bg-white"
                    }`}>
                      {consentSigned && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <span className={`text-sm leading-relaxed ${consentSigned ? "text-green-900 font-medium" : "text-slate-600"}`}>
                      I have read and agree to the Informed Consent and Clinic Policies.
                    </span>
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Navigation */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}
              className="text-slate-600 hover:text-slate-900 font-semibold disabled:opacity-40">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}
                disabled={(step === 0 && !canProceedStep0)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 h-10 shadow-sm disabled:opacity-50">
                Next <ChevronRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting || !canProceedStep1}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 h-10 shadow-sm disabled:opacity-50">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Submit Registration</>}
              </Button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-xs text-slate-400">
          <p className="font-medium">This is a secure patient registration form.</p>
          <p className="mt-1">For assistance, please contact the clinic directly.</p>
        </div>
      </main>
    </div>
  );
}
