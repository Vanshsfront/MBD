// MBD Clinic OS — Invoice numbering (PRD §6.2)
//
// Format: {centreSlug}/{seq:0000}/{branchCounter:000}-{yyyy}
// Example: COL-MBD/0001/426-2026
//
// - centreSlug: Centre.slug
// - seq: monotonic sequence per (centre, financial year). Apr 1 – Mar 31.
//        Implemented via InvoiceCounter.lastSequence with atomic upsert.
// - branchCounter: 3-digit count of invoices in the CURRENT calendar month
//        for that centre (resets monthly). Counted from Invoice rows.
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

interface AllocateArgs {
  centreId: string;
  centreSlug: string;
  /** Override the date used for FY/month/year derivation (testing). */
  now?: Date;
}

/**
 * Allocate the next invoice number atomically. Bumps `InvoiceCounter` and
 * recomputes the monthly branch counter from existing invoices.
 *
 * Run inside a transaction in the caller if you want strict atomicity with
 * the Invoice insert; the upsert is itself row-level atomic.
 */
export async function allocateInvoiceNumber({
  centreId,
  centreSlug,
  now,
}: AllocateArgs): Promise<{ invoiceNumber: string; sequence: number; branchCounter: number; financialYear: string }>
{
  const today = now ?? new Date();
  const fy = financialYearForDate(today);

  const counter = await prisma.invoiceCounter.upsert({
    where: { centreId_financialYear: { centreId, financialYear: fy } },
    update: { lastSequence: { increment: 1 } },
    create: { centreId, financialYear: fy, lastSequence: 1 },
  });
  const sequence = counter.lastSequence;

  const monthStart = startOfMonth(today);
  const nextMonth = startOfNextMonth(today);
  const monthCount = await prisma.invoice.count({
    where: {
      centreId,
      createdAt: { gte: monthStart, lt: nextMonth },
    },
  });
  const branchCounter = monthCount + 1;

  const invoiceNumber = `${centreSlug}/${pad(sequence, 4)}/${pad(branchCounter, 3)}-${today.getFullYear()}`;
  return { invoiceNumber, sequence, branchCounter, financialYear: fy };
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}
