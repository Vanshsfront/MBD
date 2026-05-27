/**
 * Reset & re-seed script.
 *
 * Wipes all patient data, reconciles the 21-staff roster to the Colaba clinic,
 * and re-seeds the service catalogue (scoped per-clinic) from the MBD rate card.
 *
 * Run:   npx tsx scripts/reset-and-seed.ts
 *
 * DESTRUCTIVE: deletes every Client, IntakeForm, IntakeToken, MedicalHistory,
 * Consultation, Package, Session, Invoice, Payment, Appointment, Alert,
 * ClientFlag, DashboardShare, ClientDoctorAssignment, ChangeRequest,
 * Notification, AuditLog, AttendanceLog, InventoryLog row.
 *
 * Staff: keeps any staff whose email matches the canonical roster; removes
 * anyone else. Re-assigns everyone to the Colaba centre. Marazban stays OWNER.
 *
 * Services: per-clinic. Wipes existing services and re-creates the Colaba
 * catalogue with the exact names/prices/GST rates from
 * All_formats/MBD Services & Rates.xlsx.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── COLABA CENTRE ───────────────────────────────────────────────────────────
const COLABA = {
  id: "mbd-colaba",
  slug: "MBDCOLABA",
  name: "Movement By Design — Colaba",
  location: "B 5, 1st Floor, Ionic Building, Justice Vyas Marg, Colaba, Mumbai — 400 005",
};

// ── DEPARTMENTS (7) ─────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { name: "Medical",                 defaultGstRate: 0 },
  { name: "Physiotherapy",           defaultGstRate: 0 },
  { name: "Massage",                 defaultGstRate: 0.18 },
  { name: "Yoga",                    defaultGstRate: 0.05 },
  { name: "Counselling",             defaultGstRate: 0.18 },
  { name: "Nutrition",               defaultGstRate: 0.18 },
  { name: "Strength & Conditioning", defaultGstRate: 0.18 },
];

// ── STAFF ROSTER (21) — matches the client-supplied hierarchy sheet ────────
// role mapping:
//   OWNER — founder
//   ADMIN — head physio with admin access
//   CONSULTANT — doctors / counsellors / nutritionists / S&C coach
//   THERAPIST — senior physios, massage therapists, yoga
//   FRONT_OFFICE — FO execs
const ROSTER = [
  { name: "Marazban Doctor",     email: "marazban@mbd.in",  role: "OWNER",        dept: null,                      designation: "Founder" },
  { name: "Dr. Yasir Zahid",     email: "yasir@mbd.in",     role: "ADMIN",        dept: "Physiotherapy",           designation: "Head Physiotherapist" },
  { name: "Dr. Prerna Chhugani", email: "prerna@mbd.in",    role: "CONSULTANT",   dept: "Medical",                 designation: "Medical Consultant" },
  { name: "Danesh Doctor",       email: "danesh@mbd.in",    role: "CONSULTANT",   dept: "Strength & Conditioning", designation: "S&C Coach" },
  { name: "Dr. Devanshi Vira",   email: "devanshi@mbd.in",  role: "THERAPIST",    dept: "Physiotherapy",           designation: "Senior Physiotherapist" },
  { name: "Dr. Aanchal Sharma",  email: "aanchal@mbd.in",   role: "THERAPIST",    dept: "Physiotherapy",           designation: "Senior Physiotherapist" },
  { name: "Dr. Tasneem Ansari",  email: "tasneem@mbd.in",   role: "THERAPIST",    dept: "Physiotherapy",           designation: "Senior Physiotherapist" },
  { name: "Dr. Deepa Mourya",    email: "deepa@mbd.in",     role: "THERAPIST",    dept: "Physiotherapy",           designation: "Senior Physiotherapist" },
  { name: "Dr. Sanya Jain",      email: "sanya@mbd.in",     role: "THERAPIST",    dept: "Physiotherapy",           designation: "Senior Physiotherapist" },
  { name: "Sanjay More",         email: "sanjay@mbd.in",    role: "THERAPIST",    dept: "Massage",                 designation: "Massage Therapist" },
  { name: "Dipali Sawant",       email: "dipali@mbd.in",    role: "THERAPIST",    dept: "Massage",                 designation: "Massage Therapist" },
  { name: "Harshali Karkare",    email: "harshali@mbd.in",  role: "THERAPIST",    dept: "Massage",                 designation: "Massage Therapist" },
  { name: "Ramchandra Bharankar",email: "ramchandra@mbd.in",role: "FRONT_OFFICE", dept: null,                      designation: "Front Office Executive" },
  { name: "Lata Sonawane",       email: "lata@mbd.in",      role: "FRONT_OFFICE", dept: null,                      designation: "Front Office Executive" },
  { name: "Helen Fernandes",     email: "helen@mbd.in",     role: "FRONT_OFFICE", dept: null,                      designation: "Front Office Executive" },
  { name: "Naina Daryanani",     email: "naina@mbd.in",     role: "THERAPIST",    dept: "Yoga",                    designation: "Yoga Specialist" },
  { name: "Shivli Malani",       email: "shivli@mbd.in",    role: "THERAPIST",    dept: "Yoga",                    designation: "Yoga & Sound Healer" },
  { name: "Disha Chandan",       email: "disha@mbd.in",     role: "CONSULTANT",   dept: "Counselling",             designation: "Integrated Counsellor" },
  { name: "Shruti Vibhakar",     email: "shruti@mbd.in",    role: "CONSULTANT",   dept: "Counselling",             designation: "Emotional Healing Counsellor" },
  { name: "Sheetal Somaiya",     email: "sheetal@mbd.in",   role: "CONSULTANT",   dept: "Nutrition",               designation: "Senior Nutritionist" },
  { name: "Rajal Shah",          email: "rajal@mbd.in",     role: "CONSULTANT",   dept: "Nutrition",               designation: "Associate Nutritionist" },
];

// ── SERVICE CATALOGUE (from MBD Services & Rates.xlsx) ──────────────────────
// Grouped by department. Prices in the "X + 18% = Y" format use the pre-GST X
// as basePrice; GST rate stored separately.
const SERVICES_BY_DEPT: Record<string, { name: string; basePrice: number; gstRate: number }[]> = {
  "Physiotherapy": [
    // Head Physiotherapist
    { name: "Consultation (Head Physiotherapist)",                  basePrice: 1500, gstRate: 0 },
    { name: "1st Consultation & Treatment (Head Physiotherapist)",  basePrice: 2700, gstRate: 0 },
    { name: "Follow Up Session (Head Physiotherapist)",             basePrice: 2200, gstRate: 0 },
    { name: "Rehab Session (Head Physiotherapist)",                 basePrice: 1800, gstRate: 0 },
    { name: "Home Visit (Head Physiotherapist)",                    basePrice: 4500, gstRate: 0 },
    // Senior Physiotherapist
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
  "Medical": [
    { name: "Medical Consultation",                            basePrice: 2000, gstRate: 0 },
  ],
  "Nutrition": [
    // Services extracted from sheet; provider names stripped. Senior / Associate
    // tiers retained because they're job-level descriptors, not person names.
    { name: "Senior Nutrition Consultation",                               basePrice: 3500, gstRate: 0.18 },
    { name: "Follow Up Session with daily monitoring of food log via app", basePrice: 2800, gstRate: 0.18 },
    { name: "Nutrition Consultation",                                      basePrice: 2800, gstRate: 0.18 },
    { name: "Nutrition Follow Up Session",                                 basePrice: 2200, gstRate: 0.18 },
  ],
  "Counselling": [
    // Focus areas (in parens) stay — they describe the service, not the person.
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

async function main() {
  const dbHost = (process.env.DATABASE_URL || "").match(/@([^/:]+)/)?.[1] ?? "?";
  console.log(`\n🎯 Target DB host: ${dbHost}`);
  console.log("🔥 Starting destructive reset + reseed...\n");

  // ── 1. Wipe patient-dependent data ──────────────────────────────────────
  console.log("1/5 — wiping patient data...");
  await prisma.auditLog.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.changeRequest.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.package.deleteMany({});
  await prisma.consultation.deleteMany({});
  await prisma.medicalHistory.deleteMany({});
  await prisma.intakeForm.deleteMany({});
  await prisma.intakeToken.deleteMany({});
  await prisma.dashboardShare.deleteMany({});
  await prisma.clientDoctorAssignment.deleteMany({});
  await prisma.clientFlag.deleteMany({});
  await prisma.attendanceLog.deleteMany({});
  await prisma.inventoryLog.deleteMany({});
  await prisma.client.deleteMany({});
  console.log("   ✅ patient records cleared");

  // ── 2. Wipe services + re-create departments ────────────────────────────
  console.log("\n2/5 — resetting services + departments...");
  await prisma.service.deleteMany({});
  const deptsByName = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { name: d.name },
      update: { defaultGstRate: d.defaultGstRate, isActive: true },
      create: d,
    });
    deptsByName.set(d.name, dept.id);
  }
  console.log(`   ✅ ${deptsByName.size} departments upserted`);

  // ── 3. Ensure Colaba centre exists (rename if old id was mumbai-hq) ─────
  console.log("\n3/5 — reconciling clinics...");
  // If old "mbd-mumbai-hq" centre exists, rename it to Colaba in place to
  // preserve FK references from Staff/Appointment/Session/Invoice rows that
  // might still point at it.
  const legacy = await prisma.centre.findUnique({ where: { id: "mbd-mumbai-hq" } }).catch(() => null);
  let colaba;
  if (legacy) {
    colaba = await prisma.centre.update({
      where: { id: "mbd-mumbai-hq" },
      data: { name: COLABA.name, slug: COLABA.slug, location: COLABA.location, isActive: true },
    });
    console.log(`   ✅ legacy 'mbd-mumbai-hq' centre renamed to Colaba`);
  } else {
    colaba = await prisma.centre.upsert({
      where: { id: COLABA.id },
      update: { name: COLABA.name, slug: COLABA.slug, location: COLABA.location, isActive: true },
      create: COLABA,
    });
    console.log(`   ✅ Colaba centre ready (${colaba.id})`);
  }

  // ── 4. Reconcile staff to the canonical roster ──────────────────────────
  console.log("\n4/5 — reconciling staff roster to 21-person hierarchy...");
  const password = await bcrypt.hash("mbd2026", 10);
  const rosterEmails = new Set(ROSTER.map((r) => r.email));

  // Remove anyone who doesn't match the roster. Because staff have FK refs
  // to audit logs, sessions, consultations etc., we deactivate rather than
  // delete them, then only hard-delete if safe.
  const nonRoster = await prisma.staff.findMany({
    where: { email: { notIn: Array.from(rosterEmails) } },
    select: { id: true, email: true, name: true },
  });
  for (const s of nonRoster) {
    const refs = await prisma.auditLog.count({ where: { performedById: s.id } });
    if (refs === 0) {
      await prisma.staff.delete({ where: { id: s.id } }).catch((e) => {
        console.warn(`   ⚠️  could not delete ${s.email}: ${e.message} — deactivating instead`);
        return prisma.staff.update({ where: { id: s.id }, data: { isActive: false } });
      });
      console.log(`   🗑  removed ${s.email}`);
    } else {
      await prisma.staff.update({ where: { id: s.id }, data: { isActive: false } });
      console.log(`   🔒  deactivated ${s.email} (has audit history)`);
    }
  }

  // Upsert every roster member + assign centre + correct role.
  for (const r of ROSTER) {
    const departmentId = r.dept ? deptsByName.get(r.dept) ?? null : null;
    await prisma.staff.upsert({
      where: { email: r.email },
      update: {
        name: r.name,
        role: r.role,
        designation: r.designation,
        departmentId,
        centreId: colaba.id,
        isActive: true,
      },
      create: {
        name: r.name,
        email: r.email,
        passwordHash: password,
        role: r.role,
        designation: r.designation,
        departmentId,
        centreId: colaba.id,
        isActive: true,
      },
    });
  }
  console.log(`   ✅ ${ROSTER.length} staff reconciled, all assigned to Colaba`);

  // ── 5. Seed services scoped to Colaba ───────────────────────────────────
  console.log("\n5/5 — seeding Colaba service catalogue...");
  let total = 0;
  for (const [deptName, services] of Object.entries(SERVICES_BY_DEPT)) {
    const deptId = deptsByName.get(deptName);
    if (!deptId) {
      console.warn(`   ⚠️  department not found: ${deptName} — skipping`);
      continue;
    }
    for (const s of services) {
      await prisma.service.create({
        data: {
          name: s.name,
          basePrice: s.basePrice,
          gstRate: s.gstRate,
          departmentId: deptId,
          centreId: colaba.id,
        },
      });
      total++;
    }
  }
  console.log(`   ✅ ${total} services seeded for Colaba`);

  console.log("\n🎉 Reset + reseed complete.");
  console.log("   Owner login: marazban@mbd.in / mbd2026");
  console.log(`   Active clinic: ${colaba.name} (slug: ${colaba.slug})\n`);
}

main()
  .catch((e) => {
    console.error("\n❌ Reset failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
