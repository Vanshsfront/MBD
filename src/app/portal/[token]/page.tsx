// Public patient portal — no login. The token in the URL is the auth.
// Renders package balance + next appointment + invoice statuses.
// PRD §8 + Phase 8.

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

export const metadata = {
  title: "Your portal — Movement By Design",
  robots: { index: false, follow: false }, // tokenised URLs must not index
};

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          clientCode: true,
          centre: { select: { name: true } },
        },
      },
    },
  });

  // Use the same gates the API uses — keep them in lockstep so refusing the
  // page doesn't leak a different error than refusing the API.
  if (!row) return <PortalRefused reason="Link not recognised." />;
  if (row.revokedAt) return <PortalRefused reason="This link has been revoked. Ask the front office for a fresh one." />;
  if (row.expiresAt < new Date()) {
    return (
      <PortalRefused
        reason={`This link expired on ${row.expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}. Ask the front office for a fresh one.`}
      />
    );
  }

  // We still go through the API GET so log-bumping happens once. Server
  // components fetch via `fetch(absoluteURL)` — derive from request headers.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;

  const res = await fetch(`${base}/api/portal/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return <PortalRefused reason="Could not load your portal — try the link again." />;
  }
  const data = (await res.json()) as PortalPayload;

  const now = new Date();

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Movement By Design
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.patient.centre ?? "Mumbai"} · {data.patient.code}
          </p>
        </header>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <p className="mt-1 text-xl font-semibold">{data.patient.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next appointment</CardTitle>
          </CardHeader>
          <CardContent>
            {data.nextAppointment ? (
              <div className="space-y-1 text-sm">
                <p className="text-base font-medium">
                  {new Date(data.nextAppointment.startIso).toLocaleString("en-IN", {
                    weekday: "long",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-muted-foreground">
                  {data.nextAppointment.service} · with {data.nextAppointment.therapist}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming appointments scheduled. Call the front office to book.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active packages ({data.packages.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.packages.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                No active packages.
              </p>
            ) : (
              <ul className="divide-y">
                {data.packages.map((p) => {
                  const validUntil = new Date(p.validUntil);
                  const daysLeft = Math.round(
                    (validUntil.getTime() - now.getTime()) / (24 * 3600_000),
                  );
                  const expiringSoon = daysLeft >= 0 && daysLeft <= 14;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {p.completedSessions}/{p.totalSessions} sessions used
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.remaining} remaining · valid till{" "}
                          {validUntil.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {daysLeft >= 0 ? ` · ${daysLeft} days left` : " · expired"}
                        </p>
                      </div>
                      {expiringSoon ? <Badge variant="warning">expiring soon</Badge> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent invoices ({data.invoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.invoices.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                No invoices yet.
              </p>
            ) : (
              <ul className="divide-y">
                {data.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                  >
                    <div>
                      <p className="font-mono font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.flavor} · {new Date(inv.createdAt).toLocaleDateString("en-IN")}
                        {inv.outstanding > 0
                          ? ` · ${formatINR(inv.outstanding)} outstanding`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {formatINR(inv.totalAmount)}
                      </span>
                      <Badge
                        variant={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "OVERDUE"
                              ? "danger"
                              : inv.status === "PARTIAL"
                                ? "warning"
                                : "info"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          Read-only view. Need a change? Call the front office.
        </p>
      </div>
    </div>
  );
}

function PortalRefused({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold">Movement By Design</h1>
          <p className="mt-3 text-sm text-muted-foreground">{reason}</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface PortalPayload {
  patient: { name: string; code: string; centre: string | null };
  packages: Array<{
    id: string;
    totalSessions: number;
    completedSessions: number;
    remaining: number;
    validUntil: string;
    status: string;
    totalPrice: number;
  }>;
  nextAppointment: {
    startIso: string;
    endIso: string;
    therapist: string;
    service: string;
  } | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    flavor: string;
    type: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    outstanding: number;
    createdAt: string;
    dueDate: string | null;
  }>;
}
