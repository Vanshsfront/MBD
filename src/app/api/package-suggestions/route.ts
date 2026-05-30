// Package suggestions — therapists/consultants push free-text suggestions
// to FO instead of creating packages themselves. FO sees pending ones at
// the top of /packages and either accepts (opens create-package dialog
// pre-filled) or dismisses.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const SUGGESTER_ROLES = new Set(["THERAPIST", "CONSULTANT", "OWNER", "ADMIN"]);
const VIEWER_ROLES = new Set([
  "FRONT_OFFICE",
  "OWNER",
  "ADMIN",
  "THERAPIST",
  "CONSULTANT",
]);

const createSchema = z.object({
  clientId: z.string().min(1),
  note: z.string().trim().min(1, "note_required").max(2000),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!SUGGESTER_ROLES.has(auth.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // Verify the client exists before creating the suggestion (avoid orphans).
  const client = await prisma.client.findUnique({
    where: { id: f.clientId },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }

  const suggestion = await prisma.packageSuggestion.create({
    data: {
      clientId: f.clientId,
      suggestedByStaffId: auth.user.id,
      note: f.note,
      status: "PENDING",
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Package",
    entityId: suggestion.id,
    performedById: auth.user.id,
    metadata: { kind: "package_suggestion", clientId: f.clientId },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ suggestion }, { status: 201 });
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!VIEWER_ROLES.has(auth.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const status = url.searchParams.get("status") ?? "PENDING";

  const suggestions = await prisma.packageSuggestion.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(status !== "ALL" ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
      suggestedByStaff: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ suggestions });
}
