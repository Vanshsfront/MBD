// POST /api/rum
//
// Ingest endpoint for real-user Core Web Vitals samples shipped from the
// browser via the web-vitals library (Apache-2.0, Google). One row per
// metric per page navigation. Unauthenticated by design — patient portal
// and intake flows also report — but rate-limited and minimal-data.
//
// Reference: audit-2026-06-06 BUNDLE-005, F-009.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enforce, clientIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  metric: z.enum(["LCP", "CLS", "INP", "FCP", "TTFB"]),
  value: z.number().min(0).max(60_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  page: z.string().max(500),
  navigationType: z
    .enum(["navigate", "reload", "back-forward", "prerender", "back_forward_cache", "restore"])
    .optional(),
  sessionId: z.string().max(64).optional(),
});

function hashShort(input: string | null | undefined): string | null {
  if (!input) return null;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export async function POST(req: Request) {
  // Loose rate limit — page navigations are bursty (5 metrics per nav is
  // typical) but a single client should not produce more than ~60/minute
  // under normal conditions.
  const rl = await enforce(`rum:${clientIp(req)}`, 120, 60 * 1000);
  if (rl) return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const f = parsed.data;
  // Strip query/fragment from the page URL — we record paths only so PHI in
  // URL parameters (e.g. patient codes) doesn't end up in the metrics table.
  const pageOnly = f.page.replace(/[?#].*$/, "").slice(0, 500);

  await prisma.rumEvent.create({
    data: {
      metric: f.metric,
      value: f.value,
      rating: f.rating ?? null,
      page: pageOnly,
      navigationType: f.navigationType ?? null,
      userAgentHash: hashShort(req.headers.get("user-agent")),
      sessionIdHash: hashShort(f.sessionId),
    },
  });

  return NextResponse.json({ ok: true });
}
