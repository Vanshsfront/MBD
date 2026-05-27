import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── HELPERS ─────────────────────────────────────────────
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function padNum(n: number, len = 4): string {
  return String(n).padStart(len, "0");
}

// ── SYNTHETIC CLIENT DATA ───────────────────────────────
const firstNames = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Ananya", "Diya", "Myra", "Sara", "Aanya", "Aadhya", "Ira", "Ahana", "Prisha", "Kiara",
  "Rohan", "Kabir", "Shaurya", "Atharv", "Advait", "Arnav", "Dhruv", "Rishi", "Tanmay", "Dev",
  "Meera", "Nisha", "Kavya", "Riya", "Tara", "Pooja", "Sneha", "Neha", "Shruti", "Isha",
];
const lastNames = [
  "Sharma", "Patel", "Mehta", "Shah", "Desai", "Joshi", "Kapoor", "Malhotra", "Gupta", "Kulkarni",
  "Iyer", "Nair", "Reddy", "Shetty", "Chopra", "Verma", "Singhania", "Khanna", "Rao", "Jain",
];
const sexes = ["Male", "Female"];
const dominances = ["Right", "Left"];
const referralSources = ["Google", "Instagram", "Friend Referral", "Doctor Referral", "Walk-in", "Website", null];

const chiefComplaintsList = [
  "Chronic lower back pain radiating to the left leg",
  "Right shoulder impingement, difficulty raising arm above head",
  "Post ACL reconstruction - 6 weeks, needs rehab",
  "Neck stiffness with cervicogenic headaches",
  "Bilateral knee pain on stair climbing",
  "Tennis elbow (lateral epicondylitis) - right side",
  "Post-operative total hip replacement rehabilitation",
  "Plantar fasciitis - bilateral, worse in the morning",
  "Thoracic spine stiffness with rounded shoulders",
  "Frozen shoulder (adhesive capsulitis) - left side",
  "Stress and anxiety affecting sleep quality",
  "Weight management and dietary planning needed",
  "Sciatica with numbness in right foot",
  "Sports injury - hamstring strain Grade 2",
  "Postural correction for IT professional",
];

const diagnoses = [
  "Lumbar disc herniation L4-L5",
  "Rotator cuff tendinopathy",
  "Post-surgical ACL graft healing - phase 2",
  "Cervical spondylosis with radiculopathy",
  "Bilateral patellofemoral syndrome",
  "Lateral epicondylitis",
  "Post-THA - good alignment, needs functional training",
  "Bilateral plantar fasciitis with calcaneal spur",
  "Upper crossed syndrome",
  "Adhesive capsulitis Stage 2 (freezing)",
  "Generalised anxiety disorder",
  "Obesity Class 1 with insulin resistance",
  "L5-S1 disc protrusion with right S1 radiculopathy",
  "Proximal hamstring tendinopathy",
  "Forward head posture with thoracic kyphosis",
];

const treatmentProtocols = [
  "Manual therapy + core stabilisation exercises, 3x/week for 6 weeks",
  "Rotator cuff strengthening protocol, progressive loading over 8 weeks",
  "ACL rehab Phase 2: closed chain exercises, balance training, 4x/week",
  "Cervical traction + postural correction + ergonomic advice",
  "VMO strengthening, patellar taping, activity modification",
  "Eccentric wrist extensor exercises + friction massage + ultrasound",
  "Gait training + hip abductor strengthening + functional mobility",
  "Calf stretching + arch support + shockwave therapy",
  "Thoracic mobilisation + scapular retraction exercises + postural taping",
  "Codman's pendulum, wall walks, passive stretching under heat",
  "CBT-based integrated counselling, 1x/week for 12 sessions",
  "Caloric deficit plan 1800 kcal + macro tracking + biweekly follow-up",
  "Neural flossing + McKenzie extension protocol + core stability",
  "Eccentric hamstring loading + dry needling + gradual return to sport",
  "Chin tucks + thoracic extensions + desk ergonomic setup",
];

const alertTypes = [
  "PACKAGE_EXPIRY",
  "SESSION_BALANCE",
  "FOLLOW_UP",
  "SCHEDULE_GAP",
  "UNPAID_INVOICE",
];

const paymentMethods = ["CASH", "CARD", "UPI", "NEFT", "RAZORPAY"];

async function main() {
  console.log("🌱 Seeding MBD database with full synthetic data...\n");

  // ══════════════════════════════════════════════════════════
  // 1. DEPARTMENTS
  // ══════════════════════════════════════════════════════════
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { name: "Medical" },
      update: {},
      create: { name: "Medical", defaultGstRate: 0 },
    }),
    prisma.department.upsert({
      where: { name: "Physiotherapy" },
      update: {},
      create: { name: "Physiotherapy", defaultGstRate: 0 },
    }),
    prisma.department.upsert({
      where: { name: "Massage" },
      update: {},
      create: { name: "Massage", defaultGstRate: 0.18 },
    }),
    prisma.department.upsert({
      where: { name: "Yoga" },
      update: {},
      create: { name: "Yoga", defaultGstRate: 0.05 },
    }),
    prisma.department.upsert({
      where: { name: "Counselling" },
      update: {},
      create: { name: "Counselling", defaultGstRate: 0.18 },
    }),
    prisma.department.upsert({
      where: { name: "Nutrition" },
      update: {},
      create: { name: "Nutrition", defaultGstRate: 0.18 },
    }),
    prisma.department.upsert({
      where: { name: "Strength & Conditioning" },
      update: {},
      create: { name: "Strength & Conditioning", defaultGstRate: 0.18 },
    }),
  ]);

  const [medical, physio, massage, yoga, counselling, nutrition, snc] = departments;
  console.log(`✅ ${departments.length} departments`);

  // ══════════════════════════════════════════════════════════
  // 1b. CENTRE (needed before services — services are per-clinic)
  // ══════════════════════════════════════════════════════════
  const centre = await prisma.centre.upsert({
    where: { id: "mbd-colaba" },
    update: {},
    create: {
      id: "mbd-colaba",
      name: "Movement By Design — Colaba",
      slug: "MBDCOLABA",
      location: "B 5, 1st Floor, Ionic Building, Justice Vyas Marg, Colaba, Mumbai — 400 005",
    },
  });
  console.log("✅ 1 centre");

  // ══════════════════════════════════════════════════════════
  // 2. SERVICES
  // ══════════════════════════════════════════════════════════
  const serviceData = [
    { name: "Medical Consultation", basePrice: 2000, gstRate: 0, departmentId: medical.id },
    { name: "Physiotherapy Consultation & Session (Head Physiotherapist)", basePrice: 2700, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Session (Head Physiotherapist)", basePrice: 2200, gstRate: 0, departmentId: physio.id },
    { name: "Rehabilitation Session (Head Physiotherapist)", basePrice: 1800, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Consultation (Head Physiotherapist)", basePrice: 1500, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Home Visit (Head Physiotherapist)", basePrice: 4500, gstRate: 0, departmentId: physio.id },
    { name: "Online Physiotherapy Session (Head Physiotherapist)", basePrice: 1500, gstRate: 0, departmentId: physio.id },
    { name: "Cupping (Head Physiotherapist)", basePrice: 2200, gstRate: 0, departmentId: physio.id },
    { name: "Rehabilitation with Cupping (Head Physiotherapist)", basePrice: 1800, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Consultation & Session (Senior Physiotherapist)", basePrice: 2000, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Session (Senior Physiotherapist)", basePrice: 1800, gstRate: 0, departmentId: physio.id },
    { name: "Rehabilitation Session (Senior Physiotherapist)", basePrice: 1500, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Consultation (Senior Physiotherapist)", basePrice: 1000, gstRate: 0, departmentId: physio.id },
    { name: "Physiotherapy Home Visit (Senior Physiotherapist)", basePrice: 3500, gstRate: 0, departmentId: physio.id },
    { name: "Online Physiotherapy Session (Senior Physiotherapist)", basePrice: 1200, gstRate: 0, departmentId: physio.id },
    { name: "Cupping (Senior Physiotherapist)", basePrice: 1800, gstRate: 0, departmentId: physio.id },
    { name: "Rehabilitation with Cupping (Senior Physiotherapist)", basePrice: 1500, gstRate: 0, departmentId: physio.id },
    { name: "K-Taping", basePrice: 600, gstRate: 0, departmentId: physio.id },
    { name: "Dry Needling", basePrice: 1500, gstRate: 0, departmentId: physio.id },
    { name: "Therapeutic Ultrasound", basePrice: 1000, gstRate: 0, departmentId: physio.id },
    { name: "K-Taping / Dry Needling / Therapeutic Ultrasound", basePrice: 1500, gstRate: 0, departmentId: physio.id },
    { name: "Sports / Deep Tissue Massage (30 min)", basePrice: 1430, gstRate: 0.18, departmentId: massage.id },
    { name: "Sports / Deep Tissue Massage (60 min)", basePrice: 2200, gstRate: 0.18, departmentId: massage.id },
    { name: "Sports / Deep Tissue Massage (90 min)", basePrice: 3300, gstRate: 0.18, departmentId: massage.id },
    { name: "Sports / Deep Tissue Massage Home Visit (30 min)", basePrice: 2420, gstRate: 0.18, departmentId: massage.id },
    { name: "Sports / Deep Tissue Massage Home Visit (60 min)", basePrice: 3300, gstRate: 0.18, departmentId: massage.id },
    { name: "Sports / Deep Tissue Massage Home Visit (90 min)", basePrice: 4400, gstRate: 0.18, departmentId: massage.id },
    { name: "Specialised Yoga", basePrice: 3200, gstRate: 0.05, departmentId: yoga.id },
    { name: "Yoga & Sound Bath", basePrice: 1900, gstRate: 0.05, departmentId: yoga.id },
    { name: "Yoga & Sound Healing / Breathwork", basePrice: 2200, gstRate: 0.05, departmentId: yoga.id },
    { name: "Wellness Yoga (with Sound Bath & Breathwork)", basePrice: 2500, gstRate: 0.05, departmentId: yoga.id },
    { name: "Group Yoga (Duo)", basePrice: 1750, gstRate: 0.05, departmentId: yoga.id },
    { name: "Group Yoga (Trio)", basePrice: 1500, gstRate: 0.05, departmentId: yoga.id },
    { name: "Integrated Counselling", basePrice: 2600, gstRate: 0.18, departmentId: counselling.id },
    { name: "Integrated Counselling Home Visit", basePrice: 3000, gstRate: 0.18, departmentId: counselling.id },
    { name: "Emotional Healing & Behavioural Change Counselling", basePrice: 3000, gstRate: 0.18, departmentId: counselling.id },
    { name: "Nutrition Consultation (Senior Nutritionist)", basePrice: 3500, gstRate: 0.18, departmentId: nutrition.id },
    { name: "Follow up Nutrition Session (Senior Nutritionist)", basePrice: 2800, gstRate: 0.18, departmentId: nutrition.id },
    { name: "Nutrition Consultation (Associate Nutritionist)", basePrice: 2800, gstRate: 0.18, departmentId: nutrition.id },
    { name: "Follow up Nutrition Session (Associate Nutritionist)", basePrice: 2200, gstRate: 0.18, departmentId: nutrition.id },
    { name: "Strength & Conditioning", basePrice: 3000, gstRate: 0.18, departmentId: snc.id },
  ];

  const services: Array<{ id: string; name: string; basePrice: number; gstRate: number; departmentId: string }> = [];
  for (const svc of serviceData) {
    const created = await prisma.service.upsert({
      where: { name_departmentId_centreId: { name: svc.name, departmentId: svc.departmentId, centreId: centre.id } },
      update: { basePrice: svc.basePrice, gstRate: svc.gstRate },
      create: { ...svc, centreId: centre.id },
    });
    services.push(created);
  }
  console.log(`✅ ${services.length} services`);

  // ══════════════════════════════════════════════════════════
  // 3. STAFF
  // ══════════════════════════════════════════════════════════
  const password = await bcrypt.hash("mbd2026", 10);

  const staffData = [
    // OWNER (Godmode) — Founder
    { name: "Dr. Marazban", email: "marazban@mbd.in", role: "OWNER" as const, departmentId: null as string | null, designation: "Founder" },
    // DEV — full-access developer account (sees every page, bypasses centre scoping)
    { name: "Developer", email: "dev@mbd.in", role: "DEV" as const, departmentId: null as string | null, designation: "Developer" },
    // ADMIN — Head Physiotherapist with admin access
    { name: "Dr. Yasir Zahid", email: "yasir@mbd.in", role: "ADMIN" as const, departmentId: physio.id, designation: "Head Physiotherapist" },
    // CONSULTANT — Medical Consultant
    { name: "Dr. Prerna Chhugani", email: "prerna@mbd.in", role: "CONSULTANT" as const, departmentId: medical.id, designation: "Medical Consultant" },
    // FRONT_OFFICE — Front Office Executives
    { name: "Ramchandra Bharankar", email: "ramchandra@mbd.in", role: "FRONT_OFFICE" as const, departmentId: null as string | null, designation: "Front Office Executive" },
    { name: "Lata Sonawane", email: "lata@mbd.in", role: "FRONT_OFFICE" as const, departmentId: null as string | null, designation: "Front Office Executive" },
    { name: "Helen Fernandes", email: "helen@mbd.in", role: "FRONT_OFFICE" as const, departmentId: null as string | null, designation: "Front Office Executive" },
    // THERAPIST — S&C Coach
    { name: "Danesh Doctor", email: "danesh@mbd.in", role: "THERAPIST" as const, departmentId: snc.id, designation: "S&C Coach" },
    // THERAPIST — Senior Physiotherapists
    { name: "Dr. Devanshi Vira", email: "devanshi@mbd.in", role: "THERAPIST" as const, departmentId: physio.id, designation: "Senior Physiotherapist" },
    { name: "Dr. Aanchal Sharma", email: "aanchal@mbd.in", role: "THERAPIST" as const, departmentId: physio.id, designation: "Senior Physiotherapist" },
    { name: "Dr. Tasneem Ansari", email: "tasneem@mbd.in", role: "THERAPIST" as const, departmentId: physio.id, designation: "Senior Physiotherapist" },
    { name: "Dr. Deepa Mourya", email: "deepa@mbd.in", role: "THERAPIST" as const, departmentId: physio.id, designation: "Senior Physiotherapist" },
    { name: "Dr. Sanya Jain", email: "sanya@mbd.in", role: "THERAPIST" as const, departmentId: physio.id, designation: "Senior Physiotherapist" },
    // THERAPIST — Massage Therapists
    { name: "Sanjay More", email: "sanjay@mbd.in", role: "THERAPIST" as const, departmentId: massage.id, designation: "Massage Therapist" },
    { name: "Dipali Sawant", email: "dipali@mbd.in", role: "THERAPIST" as const, departmentId: massage.id, designation: "Massage Therapist" },
    { name: "Harshali Karkare", email: "harshali@mbd.in", role: "THERAPIST" as const, departmentId: massage.id, designation: "Massage Therapist" },
    // THERAPIST — Yoga
    { name: "Naina Daryanani", email: "naina@mbd.in", role: "THERAPIST" as const, departmentId: yoga.id, designation: "Yoga Specialist" },
    { name: "Shivli Malani", email: "shivli@mbd.in", role: "THERAPIST" as const, departmentId: yoga.id, designation: "Yoga & Sound Healer" },
    // THERAPIST — Counselling
    { name: "Disha Chandan", email: "disha@mbd.in", role: "THERAPIST" as const, departmentId: counselling.id, designation: "Integrated Counsellor" },
    { name: "Shruti Vibhakar", email: "shruti@mbd.in", role: "THERAPIST" as const, departmentId: counselling.id, designation: "Emotional Healing Counsellor" },
    // THERAPIST — Nutrition
    { name: "Sheetal Somaiya", email: "sheetal@mbd.in", role: "THERAPIST" as const, departmentId: nutrition.id, designation: "Senior Nutritionist" },
    { name: "Rajal Shah", email: "rajal@mbd.in", role: "THERAPIST" as const, departmentId: nutrition.id, designation: "Associate Nutritionist" },
  ];

  const staffMembers: Array<{ id: string; name: string; role: string; departmentId: string | null }> = [];
  for (const staff of staffData) {
    const created = await prisma.staff.upsert({
      where: { email: staff.email },
      update: { name: staff.name, role: staff.role, designation: staff.designation },
      create: {
        name: staff.name,
        email: staff.email,
        passwordHash: password,
        role: staff.role,
        departmentId: staff.departmentId,
        designation: staff.designation,
      },
    });
    staffMembers.push(created);
  }
  console.log(`✅ ${staffMembers.length} staff members`);

  // (Centre already created above in step 1b)

  // ── Derived lookups ───────────────────────────────────────
  const therapists = staffMembers.filter((s) => ["THERAPIST", "CONSULTANT", "ADMIN"].includes(s.role));
  const consultants = staffMembers.filter((s) => ["CONSULTANT", "THERAPIST", "ADMIN"].includes(s.role));

  // ══════════════════════════════════════════════════════════
  // 5. CLIENTS (25 synthetic clients)
  // ══════════════════════════════════════════════════════════
  const NUM_CLIENTS = 25;
  const clients: Array<{ id: string; clientCode: string; firstName: string; lastName: string }> = [];

  // Delete existing synthetic data (in reverse dependency order) to allow re-running
  await prisma.payment.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.package.deleteMany({});
  await prisma.consultation.deleteMany({});
  await prisma.medicalHistory.deleteMany({});
  await prisma.intakeForm.deleteMany({});
  await prisma.dashboardShare.deleteMany({});
  await prisma.clientDoctorAssignment.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.changeRequest.deleteMany({});
  await prisma.clientFlag.deleteMany({});
  await prisma.client.deleteMany({});
  console.log("🗑️  Cleared existing client-related data for fresh seed");

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const sex = i < 20 ? sexes[i % 2] : randomFrom(sexes);
    const age = randomInt(18, 72);
    const dob = new Date(2026 - age, randomInt(0, 11), randomInt(1, 28));

    const client = await prisma.client.create({
      data: {
        clientCode: `MBD-${padNum(i + 1)}`,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@gmail.com`,
        phone: `9${randomInt(100000000, 999999999)}`,
        dob,
        age,
        sex,
        dominance: randomFrom(dominances),
        address: JSON.stringify({
          line1: `${randomInt(1, 500)}, ${randomFrom(["Andheri West", "Bandra East", "Worli", "Dadar", "Juhu", "Colaba", "Powai", "Malad West", "Goregaon", "Versova"])}`,
          city: "Mumbai",
          state: "Maharashtra",
          pin: `400${padNum(randomInt(1, 99), 3)}`,
        }),
        emergencyContact: JSON.stringify({
          name: `${randomFrom(firstNames)} ${lastName}`,
          phone: `9${randomInt(100000000, 999999999)}`,
          relation: randomFrom(["Spouse", "Parent", "Sibling", "Friend"]),
        }),
        referredBy: randomFrom(referralSources),
        centreId: centre.id,
      },
    });
    clients.push(client);
  }
  console.log(`✅ ${clients.length} clients`);

  // ══════════════════════════════════════════════════════════
  // 6. INTAKE FORMS (one per client)
  // ══════════════════════════════════════════════════════════
  for (const client of clients) {
    const selectedServices = [randomFrom(services), randomFrom(services)].map((s) => s.name);
    await prisma.intakeForm.create({
      data: {
        clientId: client.id,
        selectedServices: JSON.stringify(selectedServices),
        formData: JSON.stringify({
          occupation: randomFrom(["IT Professional", "Business Owner", "Homemaker", "Student", "Doctor", "Teacher", "Athlete", "Retired"]),
          activityLevel: randomFrom(["Sedentary", "Lightly Active", "Moderately Active", "Very Active"]),
          goals: randomFrom([
            "Pain relief and return to daily activities",
            "Sports performance improvement",
            "Post-surgery rehabilitation",
            "Stress management and overall wellness",
            "Weight management and fitness",
          ]),
        }),
        consentSigned: true,
        liabilityWaiverSigned: true,
        commercialTermsAccepted: true,
        cancellationPolicyAcknowledged: true,
        assignedTo: randomFrom(therapists).name,
        assignedBy: "Front Office",
        frontOfficeExec: "Front Office",
      },
    });
  }
  console.log(`✅ ${clients.length} intake forms`);

  // ══════════════════════════════════════════════════════════
  // 7. MEDICAL HISTORIES (one per client)
  // ══════════════════════════════════════════════════════════
  for (const client of clients) {
    const service = randomFrom(services);
    await prisma.medicalHistory.create({
      data: {
        clientId: client.id,
        serviceId: service.id,
        vitals: JSON.stringify({
          weight: `${randomInt(50, 110)} kg`,
          height: `${randomInt(150, 190)} cm`,
          bmi: (randomInt(180, 350) / 10).toFixed(1),
          pulse: `${randomInt(60, 100)} bpm`,
          spo2: `${randomInt(95, 100)}%`,
          bp: `${randomInt(100, 140)}/${randomInt(60, 90)} mmHg`,
        }),
        comorbidities: JSON.stringify({
          DM: Math.random() < 0.15,
          HTN: Math.random() < 0.2,
          CAD: Math.random() < 0.05,
          PCOS: Math.random() < 0.1,
          thyroid: Math.random() < 0.12,
          other: Math.random() < 0.2 ? "Asthma" : null,
        }),
        knownAllergies: randomFrom(["None", "Penicillin", "NSAIDs", "None", "Sulfa drugs", "None"]),
        chiefComplaints: randomFrom(chiefComplaintsList),
        pastMedicalHistory: randomFrom([
          "No significant past medical history",
          "Appendectomy 2019",
          "Dengue fever 2022, fully recovered",
          "Childhood asthma, resolved",
          "Type 2 DM since 2020, on Metformin",
        ]),
        pastSurgicalHistory: randomFrom([
          "None",
          "Appendectomy 2019",
          "ACL reconstruction 2025",
          "C-section 2021",
          "None",
          "Arthroscopic knee surgery 2023",
        ]),
        familyHistory: randomFrom([
          "Father - HTN, Mother - DM",
          "No significant family history",
          "Mother - Thyroid, Father - CAD",
          "No significant family history",
          "Father - DM, Sister - PCOS",
        ]),
        personalHistory: JSON.stringify({
          sleep: randomFrom(["6-7 hours", "7-8 hours", "5-6 hours, disturbed"]),
          diet: randomFrom(["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan"]),
          bowel: "Regular",
          others: randomFrom(["Non-smoker, occasional alcohol", "Non-smoker, non-alcoholic", "Ex-smoker, non-alcoholic"]),
        }),
        diagnosis: randomFrom(diagnoses),
        currentMedications: randomFrom(["None", "Multivitamins", "Calcium + Vitamin D", "Metformin 500mg BD", "Thyronorm 50mcg", "None"]),
        planOfCare: randomFrom(treatmentProtocols),
        followUp: randomFrom(["2 weeks", "1 month", "3 weeks", "6 weeks"]),
      },
    });
  }
  console.log(`✅ ${clients.length} medical histories`);

  // ══════════════════════════════════════════════════════════
  // 8. CONSULTATIONS (1-2 per client = ~35 total)
  // ══════════════════════════════════════════════════════════
  const allConsultations: Array<{ id: string; clientId: string; serviceId: string }> = [];

  for (const client of clients) {
    const numConsultations = randomInt(1, 2);
    for (let j = 0; j < numConsultations; j++) {
      const service = randomFrom(services);
      const consultant = randomFrom(consultants);
      const idx = allConsultations.length % chiefComplaintsList.length;

      const consultation = await prisma.consultation.create({
        data: {
          clientId: client.id,
          consultantId: consultant.id,
          serviceId: service.id,
          vitals: JSON.stringify({
            weight: `${randomInt(50, 110)} kg`,
            height: `${randomInt(150, 190)} cm`,
            bmi: (randomInt(180, 350) / 10).toFixed(1),
            pulse: `${randomInt(60, 100)} bpm`,
            spo2: `${randomInt(95, 100)}%`,
            bp: `${randomInt(100, 140)}/${randomInt(60, 90)} mmHg`,
          }),
          comorbidities: JSON.stringify({
            DM: Math.random() < 0.15,
            HTN: Math.random() < 0.2,
          }),
          chiefComplaints: chiefComplaintsList[idx],
          diagnosis: diagnoses[idx],
          planOfCare: treatmentProtocols[idx],
          treatmentProtocol: treatmentProtocols[idx],
          recommendedSessions: randomInt(6, 20),
          assessmentNotes: JSON.stringify({
            rom: randomFrom(["Limited", "Within normal limits", "Moderately restricted"]),
            strength: randomFrom(["3/5", "4/5", "4+/5", "5/5"]),
            painScale: `${randomInt(3, 8)}/10`,
            specialTests: randomFrom(["Positive Neer's", "Positive SLR", "Negative McMurray's", "Positive Tinel's", "N/A"]),
          }),
          followUp: randomFrom(["2 weeks", "1 month", "3 weeks"]),
          date: randomDate(new Date("2025-10-01"), new Date("2026-03-15")),
        },
      });
      allConsultations.push(consultation);
    }
  }
  console.log(`✅ ${allConsultations.length} consultations`);

  // ══════════════════════════════════════════════════════════
  // 9. PACKAGES (one per client = 25 packages)
  // ══════════════════════════════════════════════════════════
  const allPackages: Array<{ id: string; clientId: string; totalSessions: number; totalPrice: number; status: string }> = [];

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const consultation = allConsultations.find((c) => c.clientId === client.id);
    const numServices = randomInt(1, 3);
    const selectedServices = Array.from({ length: numServices }, () => randomFrom(services));
    const sessionsPerService = selectedServices.map(() => randomInt(4, 10));
    const totalSessions = sessionsPerService.reduce((a, b) => a + b, 0);
    const totalPrice = selectedServices.reduce((sum, svc, idx) => sum + svc.basePrice * sessionsPerService[idx], 0);
    const completedSessions = randomInt(0, totalSessions);
    const validFrom = randomDate(new Date("2025-11-01"), new Date("2026-02-01"));
    const validUntil = new Date(validFrom.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    const statusOptions = ["ACTIVE", "ACTIVE", "ACTIVE", "EXPIRED", "COMPLETED"];
    const status = completedSessions >= totalSessions ? "COMPLETED" : randomFrom(statusOptions);

    const pkg = await prisma.package.create({
      data: {
        totalSessions,
        completedSessions,
        serviceMix: JSON.stringify(
          selectedServices.map((svc, idx) => ({
            serviceId: svc.id,
            serviceName: svc.name,
            count: sessionsPerService[idx],
          }))
        ),
        validFrom,
        validUntil,
        status,
        totalPrice,
        discountPercent: randomFrom([0, 0, 5, 10, 15]),
        clientId: client.id,
        consultationId: consultation?.id ?? null,
      },
    });
    allPackages.push({ ...pkg, status });
  }
  console.log(`✅ ${allPackages.length} packages`);

  // ══════════════════════════════════════════════════════════
  // 10. SESSIONS (3-6 per client = ~100 total)
  // ══════════════════════════════════════════════════════════
  let sessionCount = 0;
  const sessionStatuses = ["SCHEDULED", "COMPLETED", "COMPLETED", "COMPLETED", "CANCELLED", "NO_SHOW"];

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const pkg = allPackages[i];
    const numSessions = randomInt(3, 6);

    for (let j = 0; j < numSessions; j++) {
      const service = randomFrom(services);
      const therapist = randomFrom(therapists);
      const sessionDate = randomDate(new Date("2025-11-15"), new Date("2026-04-15"));
      const status = sessionDate > new Date() ? "SCHEDULED" : randomFrom(sessionStatuses);

      await prisma.session.create({
        data: {
          sessionDate,
          status,
          treatmentNotes:
            status === "COMPLETED"
              ? randomFrom([
                  "Patient responded well to treatment. Pain reduced from 7/10 to 4/10.",
                  "Good progress. ROM improved by 15 degrees. Continue current protocol.",
                  "Session focused on core stability exercises. Patient compliant with HEP.",
                  "Manual therapy + electrotherapy applied. Patient reports 50% improvement.",
                  "Functional training session. Patient able to perform ADLs without pain.",
                  "Progressive resistance training. Increased load by 10%. Tolerated well.",
                ])
              : null,
          progressUpdates:
            status === "COMPLETED"
              ? randomFrom([
                  "Improving steadily. On track for discharge by session 12.",
                  "Moderate progress. May need additional sessions beyond initial plan.",
                  "Excellent compliance. Ahead of expected recovery timeline.",
                  "Slight setback due to flare-up. Adjusted intensity for next session.",
                  "Good functional improvement. Planning gradual return to sport.",
                ])
              : null,
          packageId: pkg.id,
          clientId: client.id,
          therapistId: therapist.id,
          serviceId: service.id,
          centreId: centre.id,
        },
      });
      sessionCount++;
    }
  }
  console.log(`✅ ${sessionCount} sessions`);

  // ══════════════════════════════════════════════════════════
  // 11. INVOICES (1-2 per client = ~30 total)
  // ══════════════════════════════════════════════════════════
  const allInvoices: Array<{ id: string; totalAmount: number; paidAmount: number; status: string }> = [];
  let invoiceNum = 1;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const pkg = allPackages[i];
    const numInvoices = randomInt(1, 2);

    for (let j = 0; j < numInvoices; j++) {
      const service = randomFrom(services);
      const qty = randomInt(1, 6);
      const subtotal = service.basePrice * qty;
      const gstAmount = subtotal * service.gstRate;
      const discountPercent = randomFrom([0, 0, 5, 10]);
      const totalAfterDiscount = subtotal * (1 - discountPercent / 100) + gstAmount;
      const totalAmount = Math.round(totalAfterDiscount * 100) / 100;

      const invoiceStatuses = ["PAID", "PAID", "PAID", "PARTIAL", "SENT", "DRAFT", "OVERDUE"];
      const status = randomFrom(invoiceStatuses);
      const paidAmount =
        status === "PAID"
          ? totalAmount
          : status === "PARTIAL"
          ? Math.round(totalAmount * randomFrom([0.25, 0.5, 0.75]) * 100) / 100
          : 0;

      const dueDate = randomDate(new Date("2026-01-01"), new Date("2026-04-30"));

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-2026-${padNum(invoiceNum++)}`,
          invoiceType: j === 0 ? "INVOICE" : randomFrom(["INVOICE", "PROFORMA"]),
          subtotal,
          totalGst: Math.round(gstAmount * 100) / 100,
          totalAmount,
          paidAmount,
          discountPercent,
          status,
          dueDate,
          validTill: j > 0 && Math.random() < 0.3 ? new Date(dueDate.getTime() + 15 * 24 * 60 * 60 * 1000) : null,
          referredBy: randomFrom(referralSources),
          lineItems: JSON.stringify([
            {
              serviceId: service.id,
              serviceName: service.name,
              qty,
              unitPrice: service.basePrice,
              gstRate: service.gstRate,
              gstAmount: Math.round(service.basePrice * qty * service.gstRate * 100) / 100,
              total: Math.round(service.basePrice * qty * (1 + service.gstRate) * 100) / 100,
            },
          ]),
          clientId: client.id,
          packageId: pkg.id,
        },
      });
      allInvoices.push({ ...invoice, status, paidAmount });
    }
  }
  console.log(`✅ ${allInvoices.length} invoices`);

  // ══════════════════════════════════════════════════════════
  // 12. PAYMENTS (for PAID & PARTIAL invoices)
  // ══════════════════════════════════════════════════════════
  let paymentCount = 0;

  for (const invoice of allInvoices) {
    if (invoice.paidAmount > 0) {
      const numPayments = invoice.status === "PAID" ? 1 : randomInt(1, 2);
      let remaining = invoice.paidAmount;

      for (let p = 0; p < numPayments; p++) {
        const amount = p === numPayments - 1 ? remaining : Math.round(remaining * 0.5 * 100) / 100;
        remaining -= amount;

        await prisma.payment.create({
          data: {
            amount,
            method: randomFrom(paymentMethods),
            paymentDate: randomDate(new Date("2025-12-01"), new Date("2026-03-15")),
            reference:
              randomFrom(paymentMethods) === "CASH"
                ? null
                : `TXN${randomInt(100000, 999999)}`,
            invoiceId: invoice.id,
          },
        });
        paymentCount++;
      }
    }
  }
  console.log(`✅ ${paymentCount} payments`);

  // ══════════════════════════════════════════════════════════
  // 13. ALERTS (various types across staff & clients)
  // ══════════════════════════════════════════════════════════
  const alertMessages: Record<string, string[]> = {
    PACKAGE_EXPIRY: [
      "Package expiring in 7 days",
      "Package expiring in 3 days — schedule remaining sessions",
      "Package expired yesterday, 4 sessions unused",
    ],
    SESSION_BALANCE: [
      "Only 2 sessions remaining in current package",
      "1 session remaining — discuss renewal",
      "3 sessions remaining, package expires next week",
    ],
    FOLLOW_UP: [
      "Follow-up consultation due this week",
      "Overdue follow-up: last visit was 4 weeks ago",
      "Monthly progress review scheduled",
    ],
    SCHEDULE_GAP: [
      "No sessions booked for next 2 weeks",
      "Client has a 10-day gap in schedule — check in",
      "Therapist availability conflict on Thursday",
    ],
    UNPAID_INVOICE: [
      "Invoice INV-2026-0003 overdue by 15 days",
      "Partial payment pending — ₹4,500 outstanding",
      "Invoice pending since last month — send reminder",
    ],
  };

  let alertCount = 0;
  for (let i = 0; i < 20; i++) {
    const alertType = randomFrom(alertTypes);
    const client = randomFrom(clients);
    const staffMember = randomFrom(therapists);

    await prisma.alert.create({
      data: {
        type: alertType,
        message: randomFrom(alertMessages[alertType]),
        isRead: Math.random() < 0.4,
        targetUserId: staffMember.id,
        clientId: client.id,
      },
    });
    alertCount++;
  }
  console.log(`✅ ${alertCount} alerts`);

  // ══════════════════════════════════════════════════════════
  console.log("\n🎉 Full seed complete!");
  console.log("   Owner login: marazban@mbd.in / mbd2026");
  console.log("   Developer login: dev@mbd.in / mbd2026");
  console.log("   Admin login: yasir@mbd.in / mbd2026");
  console.log("   Front Office: ramchandra@mbd.in / mbd2026");
  console.log("   Consultant: prerna@mbd.in / mbd2026");
  console.log("   All staff: [firstname]@mbd.in / mbd2026");
  console.log(`\n   Summary: ${departments.length} depts | ${services.length} services | ${staffMembers.length} staff | ${clients.length} clients`);
  console.log(`   ${allConsultations.length} consultations | ${allPackages.length} packages | ${sessionCount} sessions`);
  console.log(`   ${allInvoices.length} invoices | ${paymentCount} payments | ${alertCount} alerts`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
