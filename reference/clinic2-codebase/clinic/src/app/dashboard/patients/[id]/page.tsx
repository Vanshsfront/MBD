"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowUpRight,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Activity,
  FileText,
  CreditCard,
  Package,
  User,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Stethoscope,
  Edit2,
  ExternalLink,
  Flag,
  X,
  Save,
  Loader2,
  Users,
  IndianRupee,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface ClientData {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  dob?: string;
  age?: number;
  sex?: string;
  dominance?: string;
  address?: string;
  emergencyContact?: string;
  referredBy?: string;
  photoUrl?: string;
  consentFormPhotoUrl?: string;
  clinicPolicyAcked?: boolean;
  createdAt: string;
  preferredTherapist?: { id: string; name: string };
  doctorAssignments?: Array<{
    id: string;
    isPrimary: boolean;
    comment?: string;
    assignedAt: string;
    serviceId?: string | null;
    serviceName?: string | null;
    staff: { id: string; name: string; designation?: string };
  }>;
  intakeForms: Array<{ id: string; selectedServices: string; assignedTo?: string; createdAt: string }>;
  medicalHistories: Array<{ id: string; chiefComplaints?: string; diagnosis?: string; createdAt: string }>;
  consultations: Array<{
    id: string;
    chiefComplaints?: string;
    diagnosis?: string;
    planOfCare?: string;
    assessmentNotes?: string | null;
    date: string;
    consultant: { id: string; name: string };
    service: { name: string };
  }>;
  packages: Array<{
    id: string;
    totalSessions: number;
    completedSessions: number;
    validFrom: string;
    validUntil: string;
    status: string;
    totalPrice: number;
    expiryWarningDays?: number;
    sessions: Array<{ id: string; status: string }>;
  }>;
  sessions: Array<{
    id: string;
    sessionDate: string;
    status: string;
    therapist: { id: string; name: string };
    service: { name: string };
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
    dueDate?: string;
    payments: Array<{ id: string; amount: number; method: string; paymentDate: string; reference?: string }>;
  }>;
  flags: Array<{ id: string; type: string; label: string; color: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPackageStatusColor(pkg: ClientData["packages"][0]) {
  const now = new Date();
  const expiry = new Date(pkg.validUntil);
  const warningDays = pkg.expiryWarningDays || 14;
  const warningDate = new Date(expiry.getTime() - warningDays * 24 * 60 * 60 * 1000);

  if (pkg.status === "COMPLETED") return "green";
  if (pkg.status === "EXPIRED" || pkg.status === "CANCELLED") return "red";
  if (pkg.completedSessions >= pkg.totalSessions) return "red";
  if (now >= warningDate) return "yellow";
  return "green";
}

function getSessionUsageLabel(pkg: ClientData["packages"][0]) {
  return `${pkg.completedSessions} of ${pkg.totalSessions}`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function parseJSON(str?: string) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

// Visual distinction per clinical-record template (stored in Consultation.assessmentNotes.consultationType).
const TEMPLATE_BADGE = {
  physician:      { label: "Physician",   className: "bg-amber-50 border-amber-200 text-amber-800" },
  physiotherapy:  { label: "Physio",      className: "bg-sky-50 border-sky-200 text-sky-800" },
  counselling:    { label: "Counselling", className: "bg-rose-50 border-rose-200 text-rose-800" },
  yoga:           { label: "Yoga",        className: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  fab:            { label: "FAB",         className: "bg-blue-50 border-blue-200 text-blue-800" },
} as const;

// ── Page Component ───────────────────────────────────────────────────────────
export default function PatientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const clientId = params.id as string;
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";
  const userId = (session?.user as { id?: string })?.id ?? "";

  const { data: client, loading, error, refetch } = useApiCache<ClientData>(`/api/clients/${clientId}`);
  const { data: therapistList } = useApiCache<Array<{ id: string; name: string }>>("/api/staff?role=THERAPIST");
  const { data: referralSources } = useApiCache<Array<{ id: string; name: string; isActive: boolean }>>("/api/referral-sources?active=true");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  // Defaulter report dialog
  const [defaulterOpen, setDefaulterOpen] = useState(false);
  const { data: defaulterData } = useApiCache<Array<{ id: string; startTime: string; status: string; cancelledBy: string | null; therapist: { name: string }; service: { name: string } }>>(
    defaulterOpen ? `/api/appointments?clientId=${clientId}&status=CANCELLED,NO_SHOW` : null
  );

  // Assign Service dialog (for therapist on their own assignment)
  const [assignServiceOpen, setAssignServiceOpen] = useState<string | null>(null);
  const [assignServiceId, setAssignServiceId] = useState<string>("");
  const [assigningService, setAssigningService] = useState(false);
  const { data: servicesForAssign } = useApiCache<Array<{ id: string; name: string }>>(
    assignServiceOpen ? `/api/services?staffId=${assignServiceOpen}` : null
  );

  const submitAssignService = async () => {
    if (!assignServiceOpen || !assignServiceId) return;
    setAssigningService(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/assign-service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: assignServiceId, staffId: assignServiceOpen }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Service assigned");
      setAssignServiceOpen(null);
      setAssignServiceId("");
      invalidateCache(`/api/clients/${clientId}`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign service");
    } finally {
      setAssigningService(false);
    }
  };

  const openEditDialog = () => {
    if (!client) return;
    const addr = parseJSON(client.address);
    const ec = parseJSON(client.emergencyContact);
    setEditData({
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email || "",
      phone: client.phone,
      dob: client.dob ? client.dob.split("T")[0] : "",
      age: client.age?.toString() || "",
      sex: client.sex || "",
      dominance: client.dominance || "",
      referredBy: client.referredBy || "",
      preferredTherapistId: client.preferredTherapist?.id || "",
      addressLine1: addr?.line1 || "",
      addressCity: addr?.city || "",
      addressPincode: addr?.pincode || "",
      ecName: ec?.name || "",
      ecPhone: ec?.phone || "",
      ecRelation: ec?.relation || "",
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        firstName: editData.firstName,
        lastName: editData.lastName,
        email: editData.email || null,
        phone: editData.phone,
        dob: editData.dob || null,
        age: editData.age || null,
        sex: editData.sex || null,
        dominance: editData.dominance || null,
        referredBy: editData.referredBy || null,
        preferredTherapistId: editData.preferredTherapistId || null,
      };
      if (editData.addressLine1 || editData.addressCity) {
        body.address = { line1: editData.addressLine1, city: editData.addressCity, pincode: editData.addressPincode };
      }
      if (editData.ecName || editData.ecPhone) {
        body.emergencyContact = { name: editData.ecName, phone: editData.ecPhone, relation: editData.ecRelation };
      }

      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Patient details updated");
      setEditOpen(false);
      invalidateCache(`/api/clients/${clientId}`);
      refetch();
    } catch {
      toast.error("Failed to update patient");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="text-center py-20">
        <p className="text-text-tertiary">Patient not found.</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline text-sm">← Go back</button>
      </div>
    );
  }

  const address = parseJSON(client.address);
  const emergencyContact = parseJSON(client.emergencyContact);
  const activePackages = client.packages.filter((p) => p.status === "ACTIVE");
  const totalBalanceDue = client.invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);
  const completedSessions = client.sessions.filter((s) => s.status === "COMPLETED").length;
  const scheduledSessions = client.sessions.filter((s) => s.status === "SCHEDULED").length;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard/patients")}
          className="h-9 w-9 rounded-lg bg-surface border border-border-light flex items-center justify-center text-text-tertiary hover:text-text-primary hover:border-border-light transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary">
              {client.firstName} {client.lastName}
            </h1>
            {client.flags.map((flag) => (
              <span
                key={flag.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                  flag.color === "red" ? "bg-red-100 text-red-700" :
                  flag.color === "yellow" ? "bg-amber-100 text-amber-700" :
                  flag.color === "green" ? "bg-green-100 text-green-700" :
                  "bg-surface-secondary text-text-secondary"
                }`}
              >
                <Flag className="h-3 w-3" />
                {flag.label}
              </span>
            ))}
          </div>
          <p className="text-sm text-text-tertiary mt-0.5">
            {client.sex && `${client.sex} · `}
            {client.age && `${client.age} yrs · `}
            Since {new Date(client.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission(userRole, "patients:edit_demographic") && (
            <button
              onClick={openEditDialog}
              className="px-4 py-2 bg-surface-secondary border border-border-light rounded-xl text-text-secondary text-sm font-semibold flex items-center gap-2 hover:bg-surface-secondary transition-colors"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>
          )}
          {isClinicalRole(userRole) && (
            <button
              onClick={() => router.push(`/dashboard/patients/${client.id}/clinical-record`)}
              className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm font-semibold flex items-center gap-2 hover:bg-blue-100 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Clinical Record
            </button>
          )}
          <button
            onClick={() => setDefaulterOpen(true)}
            className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-semibold flex items-center gap-2 hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            Defaulter Report
          </button>
          {totalBalanceDue > 0 && (
            <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Balance Due: {formatCurrency(totalBalanceDue)}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Activity className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" hoverAccent="group-hover:text-blue-500" label="Sessions Done" value={completedSessions.toString()} sub={`${scheduledSessions} upcoming`} />
        <StatCard icon={<Package className="h-5 w-5 text-purple-600" />} iconBg="bg-purple-50" hoverAccent="group-hover:text-purple-500" label="Active Packages" value={activePackages.length.toString()} sub={activePackages.length > 0 ? `${activePackages[0].completedSessions}/${activePackages[0].totalSessions} in latest` : "No active packages"} />
        <StatCard icon={<IndianRupee className="h-5 w-5 text-green-600" />} iconBg="bg-green-50" hoverAccent="group-hover:text-green-500" label="Total Paid" value={formatCurrency(client.invoices.reduce((sum, inv) => sum + inv.paidAmount, 0))} sub={`${client.invoices.filter((i) => i.status === "PAID").length} invoices paid`} />
        <StatCard icon={<Stethoscope className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" hoverAccent="group-hover:text-amber-500" label="Consultations" value={client.consultations.length.toString()} sub={client.consultations[0]?.consultant?.name ? `Last: ${client.consultations[0].consultant.name}` : "---"} />
      </div>

      {/* ── Package Usage (Session Popup Context) ──────────────── */}
      {activePackages.length > 0 && (
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
          <div className="border-b border-border-light bg-surface-secondary px-6 py-4 flex items-center gap-3">
            <Package className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-bold text-text-primary">Active Packages</h2>
          </div>
          <div className="p-6 space-y-4">
            {activePackages.map((pkg) => {
              const color = getPackageStatusColor(pkg);
              const pct = Math.round((pkg.completedSessions / pkg.totalSessions) * 100);
              const daysLeft = Math.ceil((new Date(pkg.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const statusLabel = daysLeft > 0 ? "ACTIVE" : "EXPIRED";
              const statusStyle = color === "red" ? "bg-red-50 text-red-700 border-red-200" :
                color === "yellow" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                "bg-green-50 text-green-700 border-green-200";

              return (
                <div key={pkg.id} className="bg-surface-secondary rounded-xl p-5 border border-border-light">
                  <div className="flex items-center justify-between mb-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${statusStyle}`}>
                      {statusLabel}
                      {color === "yellow" && " - Expiring soon"}
                      {color === "red" && pkg.completedSessions >= pkg.totalSessions && " - Sessions used"}
                    </span>
                    <span className="text-xs text-text-tertiary font-medium">
                      Valid: {format(new Date(pkg.validFrom), "dd MMM")} --- {format(new Date(pkg.validUntil), "dd MMM yyyy")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary font-medium">Sessions Progress</span>
                      <span className="text-text-primary font-bold">{pkg.completedSessions} / {pkg.totalSessions}</span>
                    </div>
                    <div className="w-full bg-border-light rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-tertiary text-right">
                      {pkg.totalSessions - pkg.completedSessions} sessions remaining
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Two Column Layout ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left Column: Personal Info ────────────────────── */}
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border-light p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              Personal Information
            </h3>
            <div className="space-y-3 text-sm">
              <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={client.phone} />
              {client.email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={client.email} />}
              {client.dob && <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="DOB" value={new Date(client.dob).toLocaleDateString("en-IN")} />}
              {client.dominance && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Dominance" value={client.dominance} />}
              {address && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={`${address.line1}, ${address.city}`} />}
              {client.referredBy && <InfoRow icon={<ExternalLink className="h-3.5 w-3.5" />} label="Referred By" value={client.referredBy} />}
            </div>
          </div>

          {emergencyContact && (
            <div className="bg-surface rounded-xl border border-border-light p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Emergency Contact</h3>
              <div className="space-y-2 text-sm">
                <p className="text-text-secondary font-medium">{emergencyContact.name}</p>
                <p className="text-text-tertiary">{emergencyContact.phone} · {emergencyContact.relation}</p>
              </div>
            </div>
          )}

          {(client.preferredTherapist || (client.doctorAssignments && client.doctorAssignments.length > 0)) && (
            <div className="bg-surface rounded-xl border border-border-light p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                Assigned Therapists
              </h3>
              <div className="space-y-2">
                {client.doctorAssignments?.map(assignment => {
                  const isCurrentUser = assignment.staff.id === userId;
                  const showAssignService = isCurrentUser && !assignment.serviceId;
                  return (
                    <div key={assignment.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-border-light last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{assignment.staff.name}</p>
                        {assignment.staff.designation && (
                          <p className="text-[10px] text-text-tertiary">{assignment.staff.designation}</p>
                        )}
                        {assignment.serviceName ? (
                          <p className="text-[11px] text-blue-700 mt-0.5 font-semibold">Service: {assignment.serviceName}</p>
                        ) : (
                          <p className="text-[11px] text-amber-600 mt-0.5">Service not yet assigned</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {assignment.isPrimary && (
                          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Primary</span>
                        )}
                        {showAssignService && (
                          <button
                            onClick={() => setAssignServiceOpen(assignment.staff.id)}
                            className="text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                          >
                            Assign Service
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Clinical & Financial ────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Latest Consultation */}
          {client.consultations.length > 0 && (
            <div className="bg-surface rounded-xl border border-border-light p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-blue-600" />
                Clinical Records
              </h3>
              <div className="space-y-3">
                {client.consultations.slice(0, 3).map((consult) => {
                  const notes = (() => { try { return consult.assessmentNotes ? (JSON.parse(consult.assessmentNotes) as { consultationType?: string }) : {}; } catch { return {}; } })();
                  const template = notes.consultationType || "physician";
                  const tpl = TEMPLATE_BADGE[template as keyof typeof TEMPLATE_BADGE] || TEMPLATE_BADGE.physician;
                  return (
                    <div key={consult.id} className="border border-border-light rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tpl.className}`}>{tpl.label}</span>
                          <span className="text-xs text-text-tertiary">
                            {new Date(consult.date).toLocaleDateString("en-IN")} · {consult.service.name}
                          </span>
                        </div>
                        <span className="text-xs text-blue-600 font-medium">{consult.consultant.name}</span>
                      </div>
                      {consult.chiefComplaints && (
                        <p className="text-sm text-text-primary"><span className="font-medium">Chief Complaint:</span> {consult.chiefComplaints}</p>
                      )}
                      {consult.diagnosis && (
                        <p className="text-sm text-text-secondary mt-1"><span className="font-medium">Diagnosis:</span> {consult.diagnosis}</p>
                      )}
                      {consult.planOfCare && (
                        <p className="text-sm text-text-tertiary mt-1"><span className="font-medium">Plan:</span> {consult.planOfCare}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
            <div className="border-b border-border-light bg-surface-secondary px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-bold text-text-primary">Session History</h2>
              </div>
              <span className="text-xs font-medium text-text-tertiary bg-surface-secondary border border-border-light px-2 py-0.5 rounded">{client.sessions.length} sessions</span>
            </div>
            {client.sessions.length === 0 ? (
              <div className="px-6 py-4">
                <p className="text-sm text-text-tertiary">No sessions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border-light">
                {client.sessions.slice(0, 6).map((sess) => {
                  const sessionDate = new Date(sess.sessionDate);
                  const sessStatusIcon = sess.status === "COMPLETED" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> :
                    sess.status === "CANCELLED" ? <XCircle className="h-3.5 w-3.5 text-rose-600" /> :
                    sess.status === "NO_SHOW" ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" /> :
                    <Clock className="h-3.5 w-3.5 text-blue-600" />;
                  const sessStatusColor = sess.status === "COMPLETED" ? "bg-green-50 text-green-700 border-green-200" :
                    sess.status === "SCHEDULED" ? "bg-blue-50 text-blue-700 border-blue-200" :
                    sess.status === "CANCELLED" ? "bg-rose-50 text-rose-700 border-rose-200" :
                    sess.status === "NO_SHOW" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                    "bg-surface-secondary text-text-secondary border-border-light";

                  return (
                    <div key={sess.id} className="px-6 py-4 flex items-center justify-between hover:bg-surface-secondary transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center w-14 shrink-0">
                          <span className="text-lg font-bold text-text-primary">{format(sessionDate, "dd")}</span>
                          <span className="text-[10px] font-semibold text-text-tertiary uppercase">{format(sessionDate, "MMM")}</span>
                        </div>
                        <div className="h-10 border-l border-border-light" />
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{sess.service.name}</p>
                          <p className="text-xs text-text-tertiary mt-0.5">with {sess.therapist.name}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${sessStatusColor}`}>
                        {sessStatusIcon} {sess.status.replace("_", " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invoices & Payments */}
          {hasPermission(userRole, "invoices:view") && client.invoices.length > 0 && (
            <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
              <div className="border-b border-border-light bg-surface-secondary px-6 py-4 flex items-center gap-3">
                <FileText className="h-5 w-5 text-green-600" />
                <h2 className="text-base font-bold text-text-primary">Invoices & Payments</h2>
              </div>
              <div className="divide-y divide-border-light">
                {client.invoices.slice(0, 5).map((inv) => {
                  const invStatusColor = inv.status === "PAID" ? "bg-green-50 text-green-700 border-green-200" :
                    inv.status === "PARTIAL" ? "bg-orange-50 text-orange-700 border-orange-200" :
                    inv.status === "OVERDUE" ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-surface-secondary text-text-secondary border-border-light";

                  return (
                    <div
                      key={inv.id}
                      className="px-6 py-4 flex items-center justify-between hover:bg-surface-secondary transition-colors cursor-pointer group"
                      onClick={() => router.push(`/dashboard/billing/invoices?open=${inv.id}`)}
                    >
                      <div>
                        <p className="text-sm font-semibold text-blue-600 group-hover:text-blue-700 transition-colors">{inv.invoiceNumber}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">{inv.dueDate ? format(new Date(inv.dueDate), "dd MMM yyyy") : "---"}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-bold text-text-primary">{formatCurrency(inv.totalAmount)}</p>
                          {inv.paidAmount > 0 && inv.paidAmount < inv.totalAmount && (
                            <p className="text-[10px] text-green-600 font-semibold">{formatCurrency(inv.paidAmount)} paid</p>
                          )}
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${invStatusColor}`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Financial Summary */}
          {hasPermission(userRole, "invoices:view") && client.invoices.length > 0 && (() => {
            const totalInvoiced = client.invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
            const totalPaid = client.invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
            const outstandingBalance = totalInvoiced - totalPaid;
            const allPayments = client.invoices
              .flatMap((inv) => inv.payments.map((p) => ({ ...p, invoiceNumber: inv.invoiceNumber })))
              .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

            return (
              <div className="bg-surface rounded-xl border border-border-light p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-emerald-600" />
                  Financial Summary
                </h3>

                {/* Summary Row */}
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div className="bg-surface-secondary rounded-lg p-3 text-center">
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Total Invoiced</p>
                    <p className="text-lg font-bold text-text-primary">{formatCurrency(totalInvoiced)}</p>
                  </div>
                  <div className="bg-surface-secondary rounded-lg p-3 text-center">
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Total Paid</p>
                    <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${outstandingBalance > 0 ? "bg-red-50" : "bg-green-50"}`}>
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Outstanding</p>
                    <p className={`text-lg font-bold ${outstandingBalance > 0 ? "text-red-700" : "text-green-700"}`}>
                      {formatCurrency(outstandingBalance)}
                    </p>
                  </div>
                </div>

                {/* Payment History */}
                {allPayments.length > 0 && (
                  <>
                    <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Recent Payments</h4>
                    <div className="space-y-0">
                      {allPayments.slice(0, 8).map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between py-2 border-b border-border-light last:border-0">
                          <div>
                            <p className="text-sm text-text-secondary font-medium">{formatCurrency(payment.amount)}</p>
                            <p className="text-xs text-text-tertiary">
                              {new Date(payment.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              {" · "}{payment.invoiceNumber}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-surface-secondary text-text-secondary">
                              {payment.method}
                            </span>
                            {payment.reference && (
                              <span className="text-[10px] text-text-tertiary">Ref: {payment.reference}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {allPayments.length === 0 && (
                  <p className="text-sm text-text-tertiary">No payments recorded yet</p>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Edit Patient Dialog ──────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg bg-surface border-border-light shadow-xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="bg-surface-secondary border-b border-border-light p-5 flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-blue-600" /> Edit Patient Details
            </DialogTitle>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">First Name *</Label>
                <Input value={editData.firstName || ""} onChange={e => setEditData({ ...editData, firstName: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Last Name *</Label>
                <Input value={editData.lastName || ""} onChange={e => setEditData({ ...editData, lastName: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Phone *</Label>
                <Input value={editData.phone || ""} onChange={e => setEditData({ ...editData, phone: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Email</Label>
                <Input value={editData.email || ""} onChange={e => setEditData({ ...editData, email: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Date of Birth</Label>
                <Input type="date" value={editData.dob || ""} onChange={e => setEditData({ ...editData, dob: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Age</Label>
                <Input type="number" value={editData.age || ""} onChange={e => setEditData({ ...editData, age: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Sex</Label>
                <Select value={editData.sex || ""} onValueChange={v => setEditData({ ...editData, sex: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Dominance</Label>
                <Select value={editData.dominance || ""} onValueChange={v => setEditData({ ...editData, dominance: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    <SelectItem value="Right">Right</SelectItem>
                    <SelectItem value="Left">Left</SelectItem>
                    <SelectItem value="Ambidextrous">Ambidextrous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Referred By</Label>
                <Select value={editData.referredBy || ""} onValueChange={v => setEditData({ ...editData, referredBy: v === "__clear__" ? "" : v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select source">{editData.referredBy || "Select source"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-surface border-border-light max-h-64">
                    <SelectItem value="__clear__">— None —</SelectItem>
                    {(referralSources || []).map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Preferred Therapist</Label>
              <Select value={editData.preferredTherapistId || ""} onValueChange={v => setEditData({ ...editData, preferredTherapistId: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select therapist">{editData.preferredTherapistId ? therapistList?.find(t => t.id === editData.preferredTherapistId)?.name || "Select therapist" : "Select therapist"}</SelectValue></SelectTrigger>
                <SelectContent className="bg-surface border-border-light">
                  {therapistList?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border-light pt-4">
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-3">Address</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-text-secondary">Street</Label>
                  <Input value={editData.addressLine1 || ""} onChange={e => setEditData({ ...editData, addressLine1: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-text-secondary">City</Label>
                  <Input value={editData.addressCity || ""} onChange={e => setEditData({ ...editData, addressCity: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            <div className="border-t border-border-light pt-4">
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-3">Emergency Contact</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-text-secondary">Name</Label>
                  <Input value={editData.ecName || ""} onChange={e => setEditData({ ...editData, ecName: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-text-secondary">Phone</Label>
                  <Input value={editData.ecPhone || ""} onChange={e => setEditData({ ...editData, ecPhone: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-text-secondary">Relation</Label>
                  <Input value={editData.ecRelation || ""} onChange={e => setEditData({ ...editData, ecRelation: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="border-border-light text-sm h-9">Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 px-5">
                {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-1" /> Save Changes</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Defaulter Report dialog */}
      <Dialog open={defaulterOpen} onOpenChange={setDefaulterOpen}>
        <DialogContent className="sm:max-w-2xl bg-surface border-border-light">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Defaulter Report — {client.firstName} {client.lastName}
          </DialogTitle>
          {!defaulterData ? (
            <p className="text-xs text-text-tertiary py-8 text-center">Loading…</p>
          ) : defaulterData.length === 0 ? (
            <p className="text-sm text-text-tertiary py-8 text-center">No cancelled or no-show appointments on record. 🎉</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-bold text-red-700">Cancelled</p>
                  <p className="text-2xl font-bold text-red-700">{defaulterData.filter(a => a.status === "CANCELLED").length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-bold text-amber-700">No-Show</p>
                  <p className="text-2xl font-bold text-amber-700">{defaulterData.filter(a => a.status === "NO_SHOW").length}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-bold text-slate-700">Total</p>
                  <p className="text-2xl font-bold text-slate-800">{defaulterData.length}</p>
                </div>
              </div>
              <div className="border border-border-light rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] uppercase">Date</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase">Therapist</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase">Service</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase">Status</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase">Cancelled By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {defaulterData.map(a => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 text-xs">{format(new Date(a.startTime), "dd MMM yyyy, h:mm a")}</td>
                        <td className="px-3 py-2 text-xs">{a.therapist?.name}</td>
                        <td className="px-3 py-2 text-xs">{a.service?.name}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${a.status === "CANCELLED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{a.status}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-text-tertiary">{a.cancelledBy || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Service dialog — therapist chooses service for their own assignment */}
      <Dialog open={!!assignServiceOpen} onOpenChange={v => !v && setAssignServiceOpen(null)}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light">
          <DialogTitle className="text-base font-bold">Assign Service</DialogTitle>
          <p className="text-xs text-text-tertiary mb-4">Choose the service you&apos;ll be providing to this patient.</p>
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-text-secondary">Service</Label>
            <Select value={assignServiceId} onValueChange={v => v && setAssignServiceId(v)}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Select a service">
                  {assignServiceId ? servicesForAssign?.find(s => s.id === assignServiceId)?.name || "Select a service" : "Select a service"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-surface border-border-light max-h-64">
                {(servicesForAssign || []).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                {servicesForAssign && servicesForAssign.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-tertiary">No services available for your department</div>
                )}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setAssignServiceOpen(null)} className="text-sm h-9">Cancel</Button>
              <Button onClick={submitAssignService} disabled={!assignServiceId || assigningService} className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 px-5">
                {assigningService ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ icon, iconBg, hoverAccent, label, value, sub }: { icon: React.ReactNode; iconBg: string; hoverAccent: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border-light shadow-sm p-5 group hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <ArrowUpRight className={`h-4 w-4 text-text-tertiary ${hoverAccent} transition-colors`} />
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mt-1">{label}</p>
      <p className="text-xs text-text-tertiary mt-0.5">{sub}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-text-tertiary mt-0.5">{icon}</span>
      <div>
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider">{label}</p>
        <p className="text-text-secondary">{value}</p>
      </div>
    </div>
  );
}
