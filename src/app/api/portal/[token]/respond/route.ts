// Handle patient interest submission for a proforma. Public endpoint —
// token-validated + rate-limited like the other portal routes.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforce, clientIp } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Public endpoint — 30/min/IP, same as the portal GET
  const rl = await enforce(`portal:${clientIp(req)}`, 30, 60 * 1000);
  if (rl) return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });

  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { invoiceId, selected, note } = body;
  if (!invoiceId || !Array.isArray(selected) || selected.length === 0) {
    return NextResponse.json(
      { error: "missing_required_fields" },
      { status: 400 },
    );
  }

  // Validate token + get client
  const row = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: { client: true },
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.revokedAt) return NextResponse.json({ error: "revoked" }, { status: 403 });
  if (row.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 403 });
  }

  // Validate invoice exists, belongs to this client, and is PROFORMA
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      clientId: true,
      invoiceType: true,
      status: true,
      invoiceNumber: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  }

  if (invoice.clientId !== row.clientId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  if (invoice.invoiceType !== "PROFORMA") {
    return NextResponse.json(
      { error: "not_a_proforma" },
      { status: 400 },
    );
  }

  if (invoice.status === "CANCELLED") {
    return NextResponse.json(
      { error: "invoice_cancelled" },
      { status: 400 },
    );
  }

  // Notify active front-office staff at the patient's centre. Notifications are
  // per-user (the list query filters by targetUserId), so a null target would
  // surface to nobody — we fan out one row per FO staff member.
  const foStaff = await prisma.staff.findMany({
    where: {
      role: "FRONT_OFFICE",
      isActive: true,
      ...(row.client.centreId ? { centreId: row.client.centreId } : {}),
    },
    select: { id: true },
  });

  const title = "Proforma interest from patient";
  const message = `${row.client.firstName} ${row.client.lastName} (${row.client.clientCode}) is interested in: ${selected.join(", ")}${note ? `\n\nNote: ${note}` : ""}`;
  const metadata = JSON.stringify({
    clientId: row.clientId,
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    selectedServices: selected,
    note: note ?? null,
  });

  if (foStaff.length > 0) {
    await prisma.notification.createMany({
      data: foStaff.map((s) => ({
        type: "CHANGE_REQUEST",
        title,
        message,
        priority: "NORMAL",
        metadata,
        targetUserId: s.id,
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
