"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Loader2, Key, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePadComponent } from "@/components/signature-pad";

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; email?: string; role?: string } | undefined;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [draftSignature, setDraftSignature] = useState<string | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);

  useEffect(() => {
    fetch("/api/staff/me/signature")
      .then((r) => r.json())
      .then((d) => setSavedSignature(d?.signatureDataUrl || null))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!currentPassword || !newPassword) return toast.error("Fill all fields");
    if (newPassword !== confirmPassword) return toast.error("New passwords don't match");
    if (newPassword.length < 6) return toast.error("Password must be at least 6 characters");
    setSubmitting(true);
    try {
      const res = await fetch("/api/staff/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const saveSignature = async () => {
    if (!draftSignature) return;
    setSignatureBusy(true);
    try {
      const res = await fetch("/api/staff/me/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: draftSignature }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setSavedSignature(draftSignature);
      setDraftSignature(null);
      toast.success("Signature saved — it will auto-fill on patient intake forms.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save signature");
    } finally {
      setSignatureBusy(false);
    }
  };

  const clearSignature = async () => {
    setSignatureBusy(true);
    try {
      const res = await fetch("/api/staff/me/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: null }),
      });
      if (!res.ok) throw new Error("Failed");
      setSavedSignature(null);
      setDraftSignature(null);
      toast.success("Signature removed");
    } catch {
      toast.error("Failed to remove signature");
    } finally {
      setSignatureBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-2xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
          <User className="h-7 w-7 text-blue-600" /> My Profile
        </h1>
        <p className="text-sm text-text-tertiary">Your account information and login credentials.</p>
      </div>

      <div className="bg-surface rounded-xl border border-border-light p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary">Account</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase font-bold text-text-tertiary">Name</p>
            <p className="text-sm font-semibold">{user?.name || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-text-tertiary">Email</p>
            <p className="text-sm font-semibold">{user?.email || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-text-tertiary">Role</p>
            <p className="text-sm font-semibold">{user?.role || "—"}</p>
          </div>
        </div>
      </div>

      {/* Default signature — embedded into patient intake PDFs */}
      <div className="bg-surface rounded-xl border border-border-light p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
              <PenLine className="h-4 w-4" /> Default Signature
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              Auto-filled into patient intake PDFs as the Front Office Executive signature.
            </p>
          </div>
          {savedSignature && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearSignature}
              disabled={signatureBusy}
              className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          )}
        </div>

        {savedSignature ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border-light bg-white p-3">
              <p className="text-[10px] uppercase font-bold text-text-tertiary mb-2">Saved signature</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={savedSignature} alt="Saved signature" className="h-24 object-contain" />
            </div>
            <p className="text-xs text-text-tertiary">
              Replace it by drawing a new one below and clicking save.
            </p>
          </div>
        ) : (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No signature on file yet. Patient intake PDFs will leave the FO signature line blank until you set one.
          </p>
        )}

        <div className="space-y-2">
          <Label className="text-xs font-semibold">{savedSignature ? "Replace signature" : "Draw your signature"}</Label>
          <SignaturePadComponent onChange={setDraftSignature} height={160} />
          <div className="flex justify-end">
            <Button
              onClick={saveSignature}
              disabled={!draftSignature || signatureBusy}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              {signatureBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save signature"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border-light p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-2">
          <Key className="h-4 w-4" /> Change Password
        </h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Current Password</Label>
            <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="h-10" autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-10" autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-10" autoComplete="new-password" />
          </div>
          <div className="pt-2">
            <Button onClick={submit} disabled={submitting || !currentPassword || !newPassword} className="bg-blue-600 hover:bg-blue-700 text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
