"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { mapApiError, readApiError } from "@/lib/error-messages";

interface Props {
  name: string;
  email: string;
  role: string;
  designation: string | null;
  department: string | null;
  centre: string | null;
  hasSignature: boolean;
  signatureDataUrl: string | null;
}

export function ProfileView(props: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Account details + change password + signature for PDF generation.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <KV k="Name" v={props.name} />
            <KV k="Email" v={props.email} />
            <KV
              k="Role"
              v={<Badge variant="outline">{props.role}</Badge>}
            />
            <KV k="Designation" v={props.designation ?? "—"} />
            <KV k="Department" v={props.department ?? "—"} />
            <KV k="Centre" v={props.centre ?? "—"} />
          </CardContent>
        </Card>

        <ChangePasswordCard />
      </div>

      <AttendanceCard />


      <SignatureCard
        hasSignature={props.hasSignature}
        signatureDataUrl={props.signatureDataUrl}
      />
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function AttendanceCard() {
  const [pending, setPending] = useState<"CHECK_IN" | "CHECK_OUT" | null>(null);
  const [lastEvent, setLastEvent] = useState<{ type: "CHECK_IN" | "CHECK_OUT"; at: string } | null>(
    null,
  );

  async function record(type: "CHECK_IN" | "CHECK_OUT") {
    setPending(type);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; at?: string }
        | null;
      if (res.status === 409) {
        toast.message(`Already ${type === "CHECK_IN" ? "checked in" : "checked out"} today.`);
        return;
      }
      if (!res.ok || !j?.ok) {
        throw new Error(mapApiError(j, { fallback: "Couldn't record attendance." }));
      }
      const now = new Date(j.at ?? new Date().toISOString());
      setLastEvent({ type, at: now.toISOString() });
      toast.success(
        `${type === "CHECK_IN" ? "Checked in" : "Checked out"} at ${now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Attendance failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Tap once when you arrive and once when you leave. Visible to admins on the Attendance page.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => record("CHECK_IN")}
            disabled={pending !== null}
          >
            {pending === "CHECK_IN" ? "Checking in…" : "Check in"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => record("CHECK_OUT")}
            disabled={pending !== null}
          >
            {pending === "CHECK_OUT" ? "Checking out…" : "Check out"}
          </Button>
          {lastEvent ? (
            <span className="text-xs text-muted-foreground">
              Last: {lastEvent.type.replace("_", " ").toLowerCase()} at{" "}
              {new Date(lastEvent.at).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("New password must be ≥ 6 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't update your password." }),
        );
      }
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SignatureCard({
  hasSignature,
  signatureDataUrl,
}: {
  hasSignature: boolean;
  signatureDataUrl: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"pad" | "upload">("pad");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode !== "pad") return;
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
  }, [mode]);

  async function save() {
    let data: string | null = null;
    if (mode === "pad") {
      if (!padRef.current || padRef.current.isEmpty()) {
        toast.error("Sign on the pad first");
        return;
      }
      data = padRef.current.toDataURL("image/png");
    } else {
      if (!uploadDataUrl) {
        toast.error("Choose an image first");
        return;
      }
      data = uploadDataUrl;
    }

    setPending(true);
    try {
      const res = await fetch("/api/profile/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: data }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't save the signature." }),
        );
      }
      toast.success("Signature saved");
      router.refresh();
      padRef.current?.clear();
      setUploadDataUrl(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function clearStored() {
    if (!confirm("Remove your signature image?")) return;
    setPending(true);
    try {
      const res = await fetch("/api/profile/signature", { method: "DELETE" });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't clear the signature." }),
        );
      }
      toast.success("Signature cleared");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setPending(false);
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image too large (max 2 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadDataUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signature for PDF documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Used to stamp your signature on rendered consultation PDFs and invoice documents.
        </p>

        {hasSignature && signatureDataUrl ? (
          <div className="space-y-2 rounded-md border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current signature</p>
            <img
              src={signatureDataUrl}
              alt="Saved signature"
              className="h-24 w-auto rounded-md border bg-white object-contain p-2"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearStored}
              disabled={pending}
            >
              Clear signature
            </Button>
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No signature on file yet.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "pad" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("pad")}
          >
            Sign with pad
          </Button>
          <Button
            type="button"
            variant={mode === "upload" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("upload")}
          >
            Upload image
          </Button>
        </div>

        {mode === "pad" ? (
          <div className="space-y-2">
            <div className="rounded-md border bg-white">
              <canvas ref={canvasRef} className="block h-[180px] w-full touch-none" />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => padRef.current?.clear()}
              >
                Clear pad
              </Button>
              <Button type="button" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>PNG / JPG (max 2 MB)</Label>
            <input
              type="file"
              accept="image/*"
              onChange={onFileChosen}
              className="block w-full text-sm"
            />
            {uploadDataUrl ? (
              <img
                src={uploadDataUrl}
                alt="To upload"
                className="h-24 w-auto rounded-md border bg-white object-contain p-2"
              />
            ) : null}
            <div className="flex justify-end">
              <Button type="button" onClick={save} disabled={pending || !uploadDataUrl}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
