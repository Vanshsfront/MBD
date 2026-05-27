/**
 * POST /api/services/import
 *   Bulk-import the default MBD service catalogue into the currently active
 *   clinic. Skips any (name, department) that already exists. Useful for
 *   populating a fresh clinic with the standard rate card.
 *
 * Source of truth: All_formats/MBD Services & Rates.xlsx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getActiveCentreId } from "@/lib/active-centre";
import { createAuditLog } from "@/lib/audit";

// Keep in sync with scripts/reset-and-seed.ts.
const CATALOGUE: Record<string, { name: string; basePrice: number; gstRate: number }[]> = {
  "Physiotherapy": [
    { name: "Consultation (Head Physiotherapist)",                   basePrice: 1500, gstRate: 0 },
    { name: "1st Consultation & Treatment (Head Physiotherapist)",   basePrice: 2700, gstRate: 0 },
    { name: "Follow Up Session (Head Physiotherapist)",              basePrice: 2200, gstRate: 0 },
    { name: "Rehab Session (Head Physiotherapist)",                  basePrice: 1800, gstRate: 0 },
    { name: "Home Visit (Head Physiotherapist)",                     basePrice: 4500, gstRate: 0 },
    { name: "Consultation (Senior Physiotherapist)",                 basePrice: 1000, gstRate: 0 },
    { name: "1st Consultation & Treatment (Senior Physiotherapist)", basePrice: 2000, gstRate: 0 },
    { name: "Follow Up Session (Senior Physiotherapist)",            basePrice: 1800, gstRate: 0 },
    { name: "Rehab Session (Senior Physiotherapist)",                basePrice: 1500, gstRate: 0 },
    { name: "Home Visit (Senior Physiotherapist)",                   basePrice: 3500, gstRate: 0 },
    { name: "Taping",                                                basePrice: 600,  gstRate: 0 },
    { name: "Dry Needling",                                          basePrice: 1500, gstRate: 0 },
    { name: "Dry Needling / Taping / Ultrasound (Any 2)",            basePrice: 1500, gstRate: 0 },
    { name: "Only Ultrasound",                                       basePrice: 1000, gstRate: 0 },
    { name: "Cupping",                                               basePrice: 1800, gstRate: 0 },
  ],
  "Massage": [
    { name: "Deep Tissue / Sports Massage — 30 Minutes (Clinic)",     basePrice: 1430, gstRate: 0.18 },
    { name: "Deep Tissue / Sports Massage — 60 Minutes (Clinic)",     basePrice: 2200, gstRate: 0.18 },
    { name: "Deep Tissue / Sports Massage — 90 Minutes (Clinic)",     basePrice: 3300, gstRate: 0.18 },
    { name: "Deep Tissue / Sports Massage — 30 Minutes (Home Visit)", basePrice: 2420, gstRate: 0.18 },
    { name: "Deep Tissue / Sports Massage — 60 Minutes (Home Visit)", basePrice: 3300, gstRate: 0.18 },
    { name: "Deep Tissue / Sports Massage — 90 Minutes (Home Visit)", basePrice: 4400, gstRate: 0.18 },
  ],
  "Strength & Conditioning": [
    { name: "Consultation (S&C)",                              basePrice: 2500, gstRate: 0 },
    { name: "Weight Management and Nutritional Consultation", basePrice: 2500, gstRate: 0 },
    { name: "S&C Session",                                     basePrice: 3000, gstRate: 0.18 },
  ],
  "Medical":     [{ name: "Medical Consultation", basePrice: 2000, gstRate: 0 }],
  "Nutrition": [
    { name: "Senior Nutrition Consultation",                                   basePrice: 3500, gstRate: 0.18 },
    { name: "Follow Up Session with daily monitoring of food log via app",     basePrice: 2800, gstRate: 0.18 },
    { name: "Nutrition Consultation",                                          basePrice: 2800, gstRate: 0.18 },
    { name: "Nutrition Follow Up Session",                                     basePrice: 2200, gstRate: 0.18 },
  ],
  "Counselling": [
    { name: "Wellness Counselling (Child Psychology, Cognitive Development, Emotional Well-being, Anxiety & Depression, Relationship Counselling, Parenting Guidance, Addictions, EQ)", basePrice: 2600, gstRate: 0.18 },
    { name: "Wellness Counselling Home Visit",                                                                                                                                          basePrice: 3500, gstRate: 0.18 },
    { name: "Wellness Counselling (Emotional Healing, Behaviour Change, EQ)",                                                                                                           basePrice: 3000, gstRate: 0.18 },
  ],
  "Yoga": [
    { name: "Wellness Yoga (Cancer Survivors, Geriatrics, Pre/Post Natal Fitness, Kids' Yoga, Athletes, Stress Management, Balance & Homeostasis, Holistic Wellbeing)", basePrice: 3200, gstRate: 0.18 },
    { name: "Yoga with Soundbath",                                                                                                                                      basePrice: 1900, gstRate: 0.18 },
    { name: "Yoga with Sound Healing / Breathwork",                                                                                                                     basePrice: 2200, gstRate: 0.18 },
    { name: "Wellness Yoga with Soundbath & Breathwork (Anxiety, Stress, Insomnia, Prenatal, Hormonal Balancing, Thyroid, PCOS, Reproductive Health, Diabetes)",        basePrice: 2500, gstRate: 0.18 },
    { name: "Personalised Group Yoga with Soundbath/Breathwork (2 persons)",                                                                                            basePrice: 1750, gstRate: 0.18 },
    { name: "Personalised Group Yoga with Soundbath/Breathwork (3 persons)",                                                                                            basePrice: 1500, gstRate: 0.18 },
  ],
};

export async function POST(_req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!hasPermission(user?.role || "", "admin:services")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const centreId = await getActiveCentreId();
    if (!centreId) {
      return NextResponse.json({ error: "No active clinic selected" }, { status: 400 });
    }

    const departments = await prisma.department.findMany();
    const deptByName = new Map(departments.map((d) => [d.name, d.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [deptName, entries] of Object.entries(CATALOGUE)) {
      const deptId = deptByName.get(deptName);
      if (!deptId) { skipped += entries.length; continue; }
      for (const e of entries) {
        const existing = await prisma.service.findFirst({
          where: { name: e.name, departmentId: deptId, centreId },
        });
        if (existing) {
          // Refresh price/gst in case catalogue has changed.
          if (existing.basePrice !== e.basePrice || existing.gstRate !== e.gstRate || !existing.isActive) {
            await prisma.service.update({
              where: { id: existing.id },
              data: { basePrice: e.basePrice, gstRate: e.gstRate, isActive: true },
            });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        await prisma.service.create({
          data: { name: e.name, basePrice: e.basePrice, gstRate: e.gstRate, departmentId: deptId, centreId },
        });
        created++;
      }
    }

    await createAuditLog({
      action: "CREATE",
      entity: "Service",
      entityId: centreId,
      performedById: user?.id,
      metadata: { bulkImport: true, centreId, created, updated, skipped },
    });

    return NextResponse.json({ ok: true, created, updated, skipped });
  } catch (error) {
    console.error("[POST /api/services/import]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
