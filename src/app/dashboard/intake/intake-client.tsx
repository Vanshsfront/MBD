"use client";

// Intake QR generator + recent intakes list. Layout follows the 2026-05-29
// Claude Design handoff (mbd/project/mbd/calendar-intake.jsx — IntakeStaff):
//   - Top command bar: label input + Generate as one row (was scattered)
//   - 2-col grid: active QR card + share-link card with "what patient sees"
//   - Recent intakes as a .tbl tbl-compact table

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Link as LinkIcon, RefreshCw, Copy as CopyIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { readApiError } from "@/lib/error-messages";

interface TokenView {
  id: string;
  token: string;
  status: "PENDING" | "COMPLETED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  label: string | null;
  clientId: string | null;
}

export function IntakePageClient({ initialTokens }: { initialTokens: TokenView[] }) {
  const [tokens, setTokens] = useState<TokenView[]>(initialTokens);
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState<TokenView | null>(
    initialTokens.find((t) => t.status === "PENDING") ?? null,
  );
  const [label, setLabel] = useState("");

  // Real-time-ish "Expires in" countdown. Synced post-mount to avoid hydration
  // mismatch — first render uses 0 (server-equivalent), then a 0ms timer
  // refreshes immediately and a 30s interval keeps it ticking.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const sync = () => setNow(Date.now());
    const initial = setTimeout(sync, 0);
    const id = setInterval(sync, 30 * 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  async function generate() {
    setPending(true);
    try {
      const res = await fetch("/api/intake-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't generate an intake QR." }),
        );
      }
      const created = (await res.json()) as {
        id: string;
        token: string;
        expiresAt: string;
        label?: string | null;
      };
      const next: TokenView = {
        id: created.id,
        token: created.token,
        status: "PENDING",
        expiresAt: created.expiresAt,
        createdAt: new Date().toISOString(),
        createdBy: "you",
        label: created.label ?? (label.trim() || null),
        clientId: null,
      };
      setTokens((prev) => [next, ...prev]);
      setActive(next);
      setLabel("");
      toast.success("Intake QR generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="eyebrow">Patients</p>
        <h1 className="text-2xl font-semibold tracking-tight">New intake</h1>
        <p className="text-sm text-muted-foreground">
          Generate a QR or share a link that the patient scans on their phone to fill the
          intake form.
        </p>
      </header>

      {/* Command bar — label + generate in a single inline row (audit n=6) */}
      <Card>
        <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="intake-label"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Label this intake (optional)
              </label>
              <Input
                id="intake-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='e.g. "Walk-in 10:30am · referred by ENT"'
                maxLength={60}
                aria-describedby="intake-label-counter"
              />
              <p
                id="intake-label-counter"
                className="text-[11px] tabular-nums text-[color:var(--text-tertiary)]"
              >
                {label.length}/60 · helps you find this intake later in the list below
              </p>
            </div>
            <Button onClick={generate} disabled={pending} size="lg">
              <RefreshCw className="h-4 w-4" aria-hidden /> {pending ? "Generating…" : "Generate new QR"}
            </Button>
          </div>
        </div>
      </Card>

      {/* QR + share link side-by-side */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActiveTokenCard token={active} now={now} />
        <ShareLinkCard token={active} />
      </div>

      {/* Recent intakes — table layout */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
          <h2 className="text-base font-semibold">Recent intakes</h2>
        </div>
        {tokens.length === 0 ? (
          <EmptyState
            title="No intakes generated yet"
            description="Generate a QR above to mint your first intake link."
            className="m-4 border-none p-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Label</th>
                  <th>Created</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="muted font-mono text-[11.5px]">{t.token.slice(0, 12)}…</td>
                    <td>{t.label ?? <span className="text-[color:var(--text-tertiary)]">—</span>}</td>
                    <td className="muted tabular">{formatDateTime(t.createdAt)}</td>
                    <td>
                      {t.clientId ? (
                        <a
                          href={`/dashboard/patients/${t.clientId}`}
                          className="text-foreground underline-offset-2 hover:underline"
                        >
                          Open patient
                        </a>
                      ) : (
                        <span className="text-[color:var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td>
                      <StatusChip status={t.status} />
                    </td>
                    <td className="num">
                      {t.status === "PENDING" ? (
                        <button
                          type="button"
                          onClick={() => setActive(t)}
                          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border-light)] px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                        >
                          Show QR
                        </button>
                      ) : t.status === "COMPLETED" && t.clientId ? (
                        <a
                          href={`/dashboard/patients/${t.clientId}`}
                          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border-light)] px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                        >
                          View <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-[color:var(--text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ActiveTokenCard({ token, now }: { token: TokenView | null; now: number }) {
  if (!token || token.status !== "PENDING") {
    return (
      <Card>
        <div className="p-6">
          <h2 className="mb-2 text-base font-semibold">Active intake QR</h2>
          <p className="text-sm text-muted-foreground">
            Click <strong>Generate new QR</strong> above to mint a fresh code. The patient
            scans it on their phone to fill the form.
          </p>
        </div>
      </Card>
    );
  }

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/intake/${token.token}`
      : `/intake/${token.token}`;

  const minsLeft =
    now === 0
      ? null
      : Math.max(0, Math.floor((new Date(token.expiresAt).getTime() - now) / 60_000));

  const chipVariant =
    minsLeft == null
      ? "chip"
      : minsLeft === 0
        ? "chip-danger"
        : minsLeft <= 10
          ? "chip-warning"
          : "chip-success";

  return (
    <Card>
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Active intake QR</h2>
          <span className={`chip ${chipVariant}`}>
            {minsLeft == null ? "…" : minsLeft === 0 ? "expired" : `${minsLeft} min left`}
          </span>
        </div>
        <div className="grid place-items-center rounded-2xl bg-secondary p-6">
          <div className="rounded-xl bg-white p-4 ring-1 ring-[color:var(--border-light)]">
            <QRCodeSVG value={url} size={220} />
          </div>
        </div>
        {token.label ? (
          <p className="mt-3 text-center text-xs text-[color:var(--text-tertiary)]">
            Labelled: {token.label}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function ShareLinkCard({ token }: { token: TokenView | null }) {
  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/intake/${token.token}`
      : token
        ? `/intake/${token.token}`
        : "";

  return (
    <Card>
      <div className="space-y-4 p-6">
        <div>
          <h2 className="mb-1 text-base font-semibold">Or share the link</h2>
          <p className="text-xs text-muted-foreground">
            Copy and paste into WhatsApp, SMS, or email. The patient lands on the intake form
            directly.
          </p>
        </div>

        {token ? (
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-secondary px-3 py-2">
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-tertiary)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
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
              <CopyIcon className="h-3 w-3" aria-hidden /> Copy
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Generate a QR first to get a share link.</p>
        )}

        <div className="border-t border-[color:var(--border-light)] pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What the patient sees
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>2-page intake form (demographics + visit reasons)</li>
            <li>Consent acknowledgement + cancellation policy</li>
            <li>Auto-saves on every step; safe to refresh</li>
            <li>You&apos;ll be notified here when they finish</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function StatusChip({ status }: { status: "PENDING" | "COMPLETED" | "EXPIRED" }) {
  if (status === "PENDING") {
    return (
      <span className="chip chip-primary">
        <span className="dot live" aria-hidden /> Pending
      </span>
    );
  }
  if (status === "COMPLETED") return <span className="chip chip-success">Completed</span>;
  return <span className="chip">Expired</span>;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
