"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/error-messages";

interface TokenView {
  id: string;
  token: string;
  status: "PENDING" | "COMPLETED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  clientId: string | null;
}

export function IntakePageClient({ initialTokens }: { initialTokens: TokenView[] }) {
  const [tokens, setTokens] = useState<TokenView[]>(initialTokens);
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState<TokenView | null>(
    initialTokens.find((t) => t.status === "PENDING") ?? null,
  );

  // Tick every 30s so the "Expires in" countdown stays fresh and PENDING flips
  // to EXPIRED visually even before a refetch.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  async function generate() {
    setPending(true);
    try {
      const res = await fetch("/api/intake-token", { method: "POST" });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't generate an intake QR." }),
        );
      }
      const created = (await res.json()) as { id: string; token: string; expiresAt: string };
      const next: TokenView = {
        id: created.id,
        token: created.token,
        status: "PENDING",
        expiresAt: created.expiresAt,
        createdAt: new Date().toISOString(),
        createdBy: "you",
        clientId: null,
      };
      setTokens((prev) => [next, ...prev]);
      setActive(next);
      toast.success("Intake QR generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New intake</h1>
          <p className="text-sm text-muted-foreground">
            Generate a QR code for a walk-in patient to fill the intake form on their phone.
          </p>
        </div>
        <Button onClick={generate} disabled={pending}>
          {pending ? "Generating…" : "Generate QR"}
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <ActiveTokenCard token={active} now={tick} />

        <Card>
          <CardHeader>
            <CardTitle>Recent intakes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tokens.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No intakes generated yet.</p>
            ) : (
              <ul className="divide-y">
                {tokens.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={t.status} />
                      <div>
                        <p className="text-sm font-medium">{t.token.slice(0, 10)}…</p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(t.createdAt).toLocaleString()} ·{" "}
                          {t.createdBy ?? "system"}
                        </p>
                      </div>
                    </div>
                    {t.status === "PENDING" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActive(t)}
                      >
                        Show QR
                      </Button>
                    ) : t.clientId ? (
                      <a
                        href={`/dashboard/patients/${t.clientId}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        View patient
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActiveTokenCard({ token, now }: { token: TokenView | null; now: number }) {
  if (!token || token.status !== "PENDING") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>QR code</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Click <strong>Generate QR</strong> to create an intake link. The patient scans it
          on their phone and fills the form.
        </CardContent>
      </Card>
    );
  }

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/intake/${token.token}`
    : `/intake/${token.token}`;

  // Use the `now` snapshot the parent passed in — it's already a state
  // value (refreshed on a tick), so we don't need to call Date.now() in
  // render here.
  const ms = new Date(token.expiresAt).getTime() - now;
  const minsLeft = Math.max(0, Math.floor(ms / 60_000));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Patient scans this</CardTitle>
        <Badge variant={minsLeft > 5 ? "info" : "warning"}>
          {minsLeft === 0 ? "expired" : `${minsLeft} min left`}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 pb-6">
        <div className="rounded-lg border bg-white p-4">
          <QRCodeSVG value={url} size={220} />
        </div>
        <div className="w-full space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Or share this link</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs font-mono shadow-sm"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                } catch {
                  toast.error("Copy failed");
                }
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "PENDING" | "COMPLETED" | "EXPIRED" }) {
  if (status === "PENDING") return <Badge variant="info">Pending</Badge>;
  if (status === "COMPLETED") return <Badge variant="success">Completed</Badge>;
  return <Badge variant="default">Expired</Badge>;
}
