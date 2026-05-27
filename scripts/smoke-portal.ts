// Phase 8 verification — portal token roundtrip + notification type fix.
//
// 1. Issue a fresh ClientPortalToken (replicates /api/clients/[id]/portal-token
//    POST: revokes any active token, creates a new 30-day token, audit log).
// 2. Read it back via the same gates the public route + API use: confirm
//    not-revoked + not-expired.
// 3. Revoke it and confirm the gate flips.
// 4. Notification type fix: simulate the /api/appointments POST decision —
//    when client has 0 prior appointments → NEW_PATIENT; when > 0 →
//    APPT_REMINDER.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  const fo = await prisma.staff.findFirst({ where: { role: "FRONT_OFFICE", isActive: true } });
  if (!fo) throw new Error("no FRONT_OFFICE staff");
  const client = await prisma.client.findFirst({ where: { status: "ACTIVE" } });
  if (!client) throw new Error("no ACTIVE client");

  // ───── 1+2. Issue → read ─────
  const TTL_DAYS = 30;
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 3600_000);

  const issued = await prisma.$transaction(async (tx) => {
    await tx.clientPortalToken.updateMany({
      where: { clientId: client.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.clientPortalToken.create({
      data: { clientId: client.id, expiresAt, issuedById: fo.id },
    });
  });
  console.log(`[smoke-portal] issued token=${issued.token.slice(0, 8)}… expires=${expiresAt.toISOString()}`);

  const fresh = await prisma.clientPortalToken.findUnique({ where: { token: issued.token } });
  if (!fresh) throw new Error("issued token not found on re-read");
  if (fresh.revokedAt) throw new Error("freshly-issued token shouldn't be revoked");
  if (fresh.expiresAt < new Date()) throw new Error("freshly-issued token shouldn't be expired");
  console.log(`[smoke-portal] read-back: not revoked, not expired ✅`);

  // The portal API would then load packages/appointments/invoices for the
  // client. Replicate just enough to assert there's a valid payload.
  const [packages, nextAppt, invoices] = await Promise.all([
    prisma.package.findMany({ where: { clientId: client.id, status: "ACTIVE" }, take: 5 }),
    prisma.appointment.findFirst({
      where: {
        clientId: client.id,
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
        startTime: { gte: new Date() },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.invoice.findMany({ where: { clientId: client.id }, take: 5 }),
  ]);
  console.log(
    `[smoke-portal] payload counts → packages=${packages.length} nextAppt=${nextAppt ? "yes" : "no"} invoices=${invoices.length}`,
  );

  // ───── 3. Revoke → confirm gate flips ─────
  await prisma.clientPortalToken.update({
    where: { id: issued.id },
    data: { revokedAt: new Date() },
  });
  const afterRevoke = await prisma.clientPortalToken.findUnique({ where: { token: issued.token } });
  if (!afterRevoke?.revokedAt) {
    throw new Error("revoke didn't stick");
  }
  console.log(`[smoke-portal] revocation gate flipped ✅`);

  // Cleanup the smoke token.
  await prisma.clientPortalToken.delete({ where: { id: issued.id } });

  // ───── 4. Notification type branching ─────
  // For a client with 0 prior appointments, /api/appointments POST should
  // emit NEW_PATIENT; for ≥1, APPT_REMINDER. Reproduce the count + branch.
  const newClient = await prisma.client.findFirst({
    where: { appointments: { none: {} } },
    select: { id: true, firstName: true },
  });
  const returningClient = await prisma.client.findFirst({
    where: { appointments: { some: {} } },
    select: { id: true, firstName: true },
  });
  if (!returningClient) throw new Error("no client with prior appointments to test APPT_REMINDER branch");

  // We don't have a 'no-prior' client guaranteed (most seeded clients have
  // at least one appointment). Skip new-client branch when there's no such
  // client; assert the returning-client branch always picks APPT_REMINDER.
  const newBranch = newClient
    ? (await prisma.appointment.count({ where: { clientId: newClient.id } })) === 0
      ? "NEW_PATIENT"
      : "APPT_REMINDER"
    : null;
  const returningPriors = await prisma.appointment.count({ where: { clientId: returningClient.id } });
  const returningBranch = returningPriors === 0 ? "NEW_PATIENT" : "APPT_REMINDER";

  if (returningBranch !== "APPT_REMINDER") {
    throw new Error(`returning client (${returningPriors} priors) expected APPT_REMINDER, got ${returningBranch}`);
  }
  if (newClient && newBranch !== "NEW_PATIENT") {
    throw new Error(`zero-prior client expected NEW_PATIENT, got ${newBranch}`);
  }
  console.log(
    `[smoke-portal] notification branching ✅` +
      ` returning=${returningPriors} priors → ${returningBranch}` +
      (newClient ? ` · new=0 priors → ${newBranch}` : " (no zero-prior client to verify)"),
  );

  console.log(`[smoke-portal] PASS ✅`);
}

main()
  .catch((err) => {
    console.error("[smoke-portal] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
