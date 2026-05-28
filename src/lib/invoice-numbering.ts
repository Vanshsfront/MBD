// MBD Clinic OS — Invoice numbering (PRD §6.2)
//
// Format: {centreSlug}/{seq:0000}/{branchCounter:000}-{yyyy}
// Example: COL-MBD/0001/426-2026
//
// - centreSlug: Centre.slug
// - seq: monotonic sequence per (centre, financial year). Apr 1 – Mar 31.
//        Implemented via InvoiceCounter.lastSequence with atomic upsert.
// - branchCounter: 3-digit sequence per (centre, calendar month). Resets on
//        the 1st of each month. Implemented via InvoiceMonthlyCounter — the
//        upsert + increment is row-level atomic, so two concurrent invoice
//        creates in the same centre/month can never collide on the
//        Invoice.invoiceNumber @unique (which a count()-based derivation
//        could before this).
// - yyyy: current calendar year.

import { prisma } from "@/lib/prisma";

export function financialYearForDate(date: Date): string {
  // Indian FY runs April 1 – March 31.
  const year = date.getFullYear();
  const month = date.getMonth(); // 0=Jan
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${fyStart}-${fyEnd}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function yearMonthForDate(date: Date): string {
  // YYYY-MM (calendar month, not FY).
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

interface AllocateArgs {
  centreId: string;
  centreSlug: string;
  /** Override the date used for FY/month/year derivation (testing). */
  now?: Date;
}

/**
 * Allocate the next invoice number atomically. Bumps the per-FY sequence and
 * the per-month branch counter — each via its own upsert+increment, both
 * row-level atomic. Callers should still wrap the Invoice create in a
 * transaction so the number doesn't leak if the insert later fails.
 */
export async function allocateInvoiceNumber({
  centreId,
  centreSlug,
  now,
}: AllocateArgs): Promise<{ invoiceNumber: string; sequence: number; branchCounter: number; financialYear: string }>
{
  const today = now ?? new Date();
  const fy = financialYearForDate(today);
  const ym = yearMonthForDate(today);

  const counter = await prisma.invoiceCounter.upsert({
    where: { centreId_financialYear: { centreId, financialYear: fy } },
    update: { lastSequence: { increment: 1 } },
    create: { centreId, financialYear: fy, lastSequence: 1 },
  });
  const sequence = counter.lastSequence;

  const monthly = await prisma.invoiceMonthlyCounter.upsert({
    where: { centreId_yearMonth: { centreId, yearMonth: ym } },
    update: { lastSequence: { increment: 1 } },
    create: { centreId, yearMonth: ym, lastSequence: 1 },
  });
  const branchCounter = monthly.lastSequence;

  const invoiceNumber = `${centreSlug}/${pad(sequence, 4)}/${pad(branchCounter, 3)}-${today.getFullYear()}`;
  return { invoiceNumber, sequence, branchCounter, financialYear: fy };
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}
