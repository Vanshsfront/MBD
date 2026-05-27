// MBD Clinic OS — idempotent seed (PRD §9).
//
// What it builds:
//   - 1 Centre: COL-MBD "Movement By Design - Colaba"
//   - 7 Departments
//   - Services parsed from MBD Master Data (1).xlsx → ServicesMasterData
//   - 13 Products from ProductMasterData (+ InventoryItem per product per centre)
//   - 21 Staff from STAFF_CREDENTIALS.md (canonical roster) + 1 DEV
//   - 5 ReferralSources, 5 Promotions
//   - 30 sample Clients (mixed statuses)
//   - ~100 Appointments around current week
//   - ~50 completed Sessions
//   - ~30 MisEntry rows
//   - 5 sample AuditLog entries
//
// Idempotent: every upsert keys on a stable unique field. Re-running does not
// duplicate. Sample data (clients, appointments, sessions, MIS, audit) only
// runs if the centre has no existing clients (so re-running on a populated
// db won't dup).

import path from "node:path";
import { hash } from "bcryptjs";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DEFAULT_PASSWORD = "mbd2026";

const ROSTER: Array<{
  email: string;
  name: string;
  role: string;
  department: string | null;
  designation: string | null;
}> = [
  { email: "marazban@mbd.in", name: "Marazban Doctor", role: "OWNER", department: null, designation: "Founder" },
  { email: "yasir@mbd.in", name: "Dr. Yasir Zahid", role: "ADMIN", department: "Physiotherapy", designation: "Head Physiotherapist" },
  { email: "prerna@mbd.in", name: "Dr. Prerna Chhugani", role: "CONSULTANT", department: "Medical", designation: "Medical Consultant" },
  { email: "danesh@mbd.in", name: "Danesh Doctor", role: "CONSULTANT", department: "S&C", designation: "S&C Coach" },
  { email: "devanshi@mbd.in", name: "Dr. Devanshi Vira", role: "THERAPIST", department: "Physiotherapy", designation: "Senior Physiotherapist" },
  { email: "aanchal@mbd.in", name: "Dr. Aanchal Sharma", role: "THERAPIST", department: "Physiotherapy", designation: "Senior Physiotherapist" },
  { email: "tasneem@mbd.in", name: "Dr. Tasneem Ansari", role: "THERAPIST", department: "Physiotherapy", designation: "Senior Physiotherapist" },
  { email: "deepa@mbd.in", name: "Dr. Deepa Mourya", role: "THERAPIST", department: "Physiotherapy", designation: "Senior Physiotherapist" },
  { email: "sanya@mbd.in", name: "Dr. Sanya Jain", role: "THERAPIST", department: "Physiotherapy", designation: "Senior Physiotherapist" },
  { email: "sanjay@mbd.in", name: "Sanjay More", role: "THERAPIST", department: "Massage", designation: "Massage Therapist" },
  { email: "dipali@mbd.in", name: "Dipali Sawant", role: "THERAPIST", department: "Massage", designation: "Massage Therapist" },
  { email: "harshali@mbd.in", name: "Harshali Karkare", role: "THERAPIST", department: "Massage", designation: "Massage Therapist" },
  { email: "ramchandra@mbd.in", name: "Ramchandra Bharankar", role: "FRONT_OFFICE", department: null, designation: "Front Office Executive" },
  { email: "lata@mbd.in", name: "Lata Sonawane", role: "FRONT_OFFICE", department: null, designation: "Front Office Executive" },
  { email: "helen@mbd.in", name: "Helen Fernandes", role: "FRONT_OFFICE", department: null, designation: "Front Office Executive" },
  { email: "naina@mbd.in", name: "Naina Daryanani", role: "THERAPIST", department: "Yoga", designation: "Yoga Specialist" },
  { email: "shivli@mbd.in", name: "Shivli Malani", role: "THERAPIST", department: "Yoga", designation: "Yoga & Sound Healer" },
  { email: "disha@mbd.in", name: "Disha Chandan", role: "CONSULTANT", department: "Counselling", designation: "Integrated Counsellor" },
  { email: "shruti@mbd.in", name: "Shruti Vibhakar", role: "CONSULTANT", department: "Counselling", designation: "Emotional Healing Counsellor" },
  { email: "sheetal@mbd.in", name: "Sheetal Somaiya", role: "CONSULTANT", department: "Nutrition", designation: "Senior Nutritionist" },
  { email: "rajal@mbd.in", name: "Rajal Shah", role: "CONSULTANT", department: "Nutrition", designation: "Associate Nutritionist" },
  { email: "dev@mbd.in", name: "Dev Account", role: "DEV", department: null, designation: "Developer" },
];

const DEPARTMENTS: Array<{ name: string; defaultGstRate: number; defaultHsnSac: string | null }> = [
  { name: "Medical", defaultGstRate: 0, defaultHsnSac: "999312" },
  { name: "Physiotherapy", defaultGstRate: 0, defaultHsnSac: "999314" },
  { name: "Massage", defaultGstRate: 0.18, defaultHsnSac: "94021090" },
  { name: "Yoga", defaultGstRate: 0.05, defaultHsnSac: "999723" },
  { name: "Counselling", defaultGstRate: 0.18, defaultHsnSac: "999319" },
  { name: "Nutrition", defaultGstRate: 0.18, defaultHsnSac: "999319" },
  { name: "S&C", defaultGstRate: 0.18, defaultHsnSac: "998733" },
];

const REFERRAL_SOURCES: Array<{ name: string; sortOrder: number }> = [
  { name: "Walk-in", sortOrder: 0 },
  { name: "Doctor referral", sortOrder: 1 },
  { name: "Friend / family", sortOrder: 2 },
  { name: "Google search", sortOrder: 3 },
  { name: "Instagram", sortOrder: 4 },
];

const PROMOTIONS: Array<{
  code: string;
  name: string;
  description: string;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
}> = [
  { code: "SENIOR5", name: "Senior Citizen 5%", description: "Discount for patients 60+", discountType: "PERCENT", discountValue: 5, maxDiscount: null },
  { code: "ARMED10", name: "Armed Forces 10%", description: "Discount for serving / retired armed forces", discountType: "PERCENT", discountValue: 10, maxDiscount: 1500 },
  { code: "FESTIVAL15", name: "Festival 15%", description: "Limited-time festival promo", discountType: "PERCENT", discountValue: 15, maxDiscount: 2500 },
  { code: "WELCOME5", name: "Welcome 5%", description: "First-visit discount", discountType: "PERCENT", discountValue: 5, maxDiscount: null },
  { code: "REFERRAL10", name: "Referral 10%", description: "Discount via referred patient", discountType: "PERCENT", discountValue: 10, maxDiscount: 2000 },
];

const SAMPLE_CLIENTS: Array<{
  firstName: string;
  lastName: string;
  age: number;
  sex: string;
  phone: string;
  email?: string;
  occupation?: string;
  sport?: string;
}> = [
  { firstName: "Aarav", lastName: "Mehta", age: 34, sex: "M", phone: "+91 98200 11122", email: "aarav.mehta@example.in", occupation: "Software Engineer" },
  { firstName: "Anaya", lastName: "Iyer", age: 28, sex: "F", phone: "+91 98202 33344", email: "anaya.iyer@example.in", occupation: "Designer" },
  { firstName: "Vihaan", lastName: "Reddy", age: 41, sex: "M", phone: "+91 98203 55566", email: "vihaan.reddy@example.in", occupation: "Banker" },
  { firstName: "Diya", lastName: "Kapoor", age: 22, sex: "F", phone: "+91 98204 77788", email: "diya.kapoor@example.in", occupation: "Student" },
  { firstName: "Arjun", lastName: "Shah", age: 56, sex: "M", phone: "+91 98205 99900", email: "arjun.shah@example.in", occupation: "Entrepreneur" },
  { firstName: "Saanvi", lastName: "Patel", age: 31, sex: "F", phone: "+91 98206 11122", email: "saanvi.patel@example.in" },
  { firstName: "Krishna", lastName: "Bhat", age: 47, sex: "M", phone: "+91 98207 33344" },
  { firstName: "Kavya", lastName: "Nair", age: 38, sex: "F", phone: "+91 98208 55566", occupation: "Doctor" },
  { firstName: "Ishaan", lastName: "Joshi", age: 19, sex: "M", phone: "+91 98209 77788", occupation: "Student" },
  { firstName: "Myra", lastName: "Verma", age: 26, sex: "F", phone: "+91 98210 99900" },
  { firstName: "Aaditya", lastName: "Rao", age: 52, sex: "M", phone: "+91 98211 11122" },
  { firstName: "Pari", lastName: "Singh", age: 30, sex: "F", phone: "+91 98212 33344", occupation: "Lawyer" },
  { firstName: "Reyansh", lastName: "Khanna", age: 35, sex: "M", phone: "+91 98213 55566", occupation: "Pilot" },
  { firstName: "Aadhya", lastName: "Bose", age: 29, sex: "F", phone: "+91 98214 77788" },
  { firstName: "Vivaan", lastName: "Chopra", age: 44, sex: "M", phone: "+91 98215 99900" },
  { firstName: "Anika", lastName: "Sinha", age: 33, sex: "F", phone: "+91 98216 11122" },
  { firstName: "Atharv", lastName: "Pillai", age: 21, sex: "M", phone: "+91 98217 33344", occupation: "Athlete", sport: "Cricket" },
  { firstName: "Riya", lastName: "Mukherjee", age: 27, sex: "F", phone: "+91 98218 55566" },
  { firstName: "Kabir", lastName: "Saxena", age: 49, sex: "M", phone: "+91 98219 77788" },
  { firstName: "Navya", lastName: "Gupta", age: 24, sex: "F", phone: "+91 98220 99900" },
  { firstName: "Yash", lastName: "Desai", age: 39, sex: "M", phone: "+91 98221 11122" },
  { firstName: "Tara", lastName: "Banerjee", age: 32, sex: "F", phone: "+91 98222 33344" },
  { firstName: "Ayaan", lastName: "Malhotra", age: 23, sex: "M", phone: "+91 98223 55566", occupation: "Athlete", sport: "Football" },
  { firstName: "Inaya", lastName: "Tiwari", age: 36, sex: "F", phone: "+91 98224 77788" },
  { firstName: "Dev", lastName: "Kulkarni", age: 45, sex: "M", phone: "+91 98225 99900" },
  { firstName: "Sara", lastName: "Roy", age: 25, sex: "F", phone: "+91 98226 11122" },
  { firstName: "Rohan", lastName: "Bhatia", age: 51, sex: "M", phone: "+91 98227 33344" },
  { firstName: "Isha", lastName: "Menon", age: 40, sex: "F", phone: "+91 98228 55566" },
  { firstName: "Veer", lastName: "Hegde", age: 37, sex: "M", phone: "+91 98229 77788", occupation: "Athlete", sport: "Tennis" },
  { firstName: "Mira", lastName: "Subramaniam", age: 30, sex: "F", phone: "+91 98230 99900" },
];

interface ParsedService {
  department: string;
  consultantName: string;
  name: string;
  hsnSac: string;
  basePrice: number;
  gstRate: number;
}

interface ParsedProduct {
  name: string;
  hsnSac: string;
}

async function parseMasterData(): Promise<{ services: ParsedService[]; products: ParsedProduct[] }> {
  const wb = new ExcelJS.Workbook();
  const filePath = path.join(process.cwd(), "reference-material/formats/MBD Master Data (1).xlsx");
  await wb.xlsx.readFile(filePath);

  const services: ParsedService[] = [];
  const seenServices = new Set<string>();
  const productsParsed: ParsedProduct[] = [];
  const seenProducts = new Set<string>();

  const servicesSheet = wb.getWorksheet("ServicesMasterData");
  if (servicesSheet) {
    let currentDepartment = "";
    let currentConsultant = "";
    for (let r = 4; r <= servicesSheet.rowCount; r++) {
      const row = servicesSheet.getRow(r);
      const dept = stringValue(row.getCell(1));
      const consultant = stringValue(row.getCell(2));
      const name = stringValue(row.getCell(3))?.trim();
      const hsn = stringValue(row.getCell(4));
      const cost = numberValue(row.getCell(5));
      const gst = numberValue(row.getCell(6));

      // Stop when we hit the dropdown helper section.
      if (dept === "DROPDOWN OPTION LIST" || name === "DROPDOWN OPTION LIST") {
        break;
      }

      if (dept) currentDepartment = dept;
      if (consultant) currentConsultant = consultant;
      if (!name) continue;

      const key = `${currentDepartment}::${name}`;
      if (seenServices.has(key)) continue;
      seenServices.add(key);

      services.push({
        department: currentDepartment,
        consultantName: currentConsultant,
        name,
        hsnSac: hsn ?? "",
        basePrice: cost ?? 0,
        gstRate: gst ?? 0,
      });
    }
  }

  const productsSheet = wb.getWorksheet("ProductMasterData");
  if (productsSheet) {
    for (let r = 3; r <= productsSheet.rowCount; r++) {
      const row = productsSheet.getRow(r);
      const a = stringValue(row.getCell(1));
      // Stop at the dropdown helper section in the products sheet too.
      if (!a || a === "Product") break;
      const hsn = stringValue(row.getCell(2)) ?? "";
      const name = a.trim();
      if (seenProducts.has(name)) continue;
      seenProducts.add(name);
      productsParsed.push({ name, hsnSac: hsn });
    }
  }

  return { services, products: productsParsed };
}

function stringValue(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "result" in (v as { result?: unknown })) {
    const r = (v as { result: unknown }).result;
    return r != null ? String(r) : null;
  }
  return String(v);
}

function numberValue(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in (v as { result?: unknown })) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inferServiceType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("home visit")) return "HOME_VISIT";
  if (n.includes("online")) return "ONLINE";
  if (n.includes("cardio") || n.includes("strength & conditioning")) return "GYM";
  return "CLINIC";
}

function inferParticipantCount(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("(trio)")) return 3;
  if (n.includes("(duo)")) return 2;
  return 1;
}

function makeClientCode(seq: number): string {
  return `COL-MBD-${seq.toString().padStart(4, "0")}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; cannot run seed.");
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("[seed] starting");

    // Centre
    const centre = await prisma.centre.upsert({
      where: { slug: "COL-MBD" },
      update: {},
      create: {
        name: "Movement By Design — Colaba",
        slug: "COL-MBD",
        location: "Colaba, Mumbai",
        address: JSON.stringify({ line1: "Colaba", city: "Mumbai", pincode: "400005" }),
        contactPhone: "+91 22 0000 0000",
      },
    });
    console.log(`[seed] Centre upserted: ${centre.slug}`);

    // Departments
    const deptRows = await Promise.all(
      DEPARTMENTS.map((d) =>
        prisma.department.upsert({
          where: { name: d.name },
          update: {
            defaultGstRate: d.defaultGstRate,
            defaultHsnSac: d.defaultHsnSac,
          },
          create: d,
        }),
      ),
    );
    const deptByName = new Map(deptRows.map((d) => [d.name, d]));
    console.log(`[seed] Departments: ${deptRows.length}`);

    // Staff (idempotent on email). Never seed the DEV super-account in
    // production (audit H-3) — it's a dev/testing convenience only.
    const passwordHash = await hash(DEFAULT_PASSWORD, 10);
    const roster =
      process.env.NODE_ENV === "production" ? ROSTER.filter((s) => s.role !== "DEV") : ROSTER;
    const staffRows = await Promise.all(
      roster.map((s) => {
        const dept = s.department ? deptByName.get(s.department) : null;
        return prisma.staff.upsert({
          where: { email: s.email },
          update: {
            name: s.name,
            role: s.role,
            departmentId: dept?.id ?? null,
            designation: s.designation,
            centreId: centre.id,
          },
          create: {
            name: s.name,
            email: s.email,
            passwordHash,
            role: s.role,
            departmentId: dept?.id ?? null,
            designation: s.designation,
            centreId: centre.id,
            isActive: true,
          },
        });
      }),
    );
    const staffByName = new Map(staffRows.map((s) => [s.name.toLowerCase(), s]));
    console.log(`[seed] Staff: ${staffRows.length}`);

    // Master data
    const { services, products } = await parseMasterData();

    // Services (upsert by [name, departmentId, centreId])
    let serviceCount = 0;
    for (const svc of services) {
      const dept = deptByName.get(svc.department);
      if (!dept) {
        console.warn(`[seed] skipping service for unknown department: ${svc.department}`);
        continue;
      }
      await prisma.service.upsert({
        where: {
          name_departmentId_centreId: {
            name: svc.name,
            departmentId: dept.id,
            centreId: centre.id,
          },
        },
        update: {
          basePrice: svc.basePrice,
          gstRate: svc.gstRate,
          hsnSacCode: svc.hsnSac,
        },
        create: {
          name: svc.name,
          basePrice: svc.basePrice,
          gstRate: svc.gstRate,
          hsnSacCode: svc.hsnSac,
          departmentId: dept.id,
          centreId: centre.id,
          serviceType: inferServiceType(svc.name),
          participantCount: inferParticipantCount(svc.name),
        },
      });
      serviceCount++;
    }
    console.log(`[seed] Services: ${serviceCount}`);

    // Products + InventoryItem
    let productCount = 0;
    for (const p of products) {
      const product = await prisma.product.upsert({
        where: { sku: `MBD-${slug(p.name)}` },
        update: { hsnSacCode: p.hsnSac, name: p.name },
        create: {
          name: p.name,
          sku: `MBD-${slug(p.name)}`,
          category: inferProductCategory(p.name),
          hsnSacCode: p.hsnSac,
          gstRate: 0.18,
        },
      });
      await prisma.inventoryItem.upsert({
        where: { productId_centreId: { productId: product.id, centreId: centre.id } },
        update: {},
        create: {
          productId: product.id,
          centreId: centre.id,
          supplierName: "MBD Supplies",
          supplyPrice: estimateProductPrice(p.name) * 0.7,
          sellingPrice: estimateProductPrice(p.name),
          stock: 25,
          minStock: 5,
        },
      });
      productCount++;
    }
    console.log(`[seed] Products + InventoryItems: ${productCount}`);

    // Referral sources
    for (const r of REFERRAL_SOURCES) {
      await prisma.referralSource.upsert({
        where: { name: r.name },
        update: { sortOrder: r.sortOrder },
        create: r,
      });
    }
    console.log(`[seed] ReferralSources: ${REFERRAL_SOURCES.length}`);

    // Promotions
    for (const p of PROMOTIONS) {
      await prisma.promotion.upsert({
        where: { code: p.code },
        update: {},
        create: p,
      });
    }
    console.log(`[seed] Promotions: ${PROMOTIONS.length}`);

    // Sample data — only seed if no clients exist for this centre.
    const existingClientCount = await prisma.client.count({ where: { centreId: centre.id } });
    if (existingClientCount > 0) {
      console.log(`[seed] sample data skipped (${existingClientCount} clients already exist)`);
      return;
    }

    const referrals = await prisma.referralSource.findMany();
    const allServices = await prisma.service.findMany({ where: { centreId: centre.id } });
    const therapists = staffRows.filter(
      (s) => s.role === "THERAPIST" || s.role === "CONSULTANT",
    );

    const yasir = staffByName.get("dr. yasir zahid");
    const fo = staffByName.get("ramchandra bharankar") ?? staffRows.find((s) => s.role === "FRONT_OFFICE");

    // 30 sample clients
    const clientRows: Awaited<ReturnType<typeof prisma.client.create>>[] = [];
    for (let i = 0; i < SAMPLE_CLIENTS.length; i++) {
      const c = SAMPLE_CLIENTS[i]!;
      const referral = referrals[i % referrals.length]!;
      const status = i < 3 ? "DRAFT" : i % 9 === 0 ? "INACTIVE" : "ACTIVE";
      const customerType = i % 3 === 0 ? "WALK_IN" : i % 3 === 1 ? "REFERRAL" : "BOOKING";
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - c.age);

      const created = await prisma.client.create({
        data: {
          clientCode: makeClientCode(i + 1),
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          dob,
          age: c.age,
          sex: c.sex,
          occupation: c.occupation,
          sport: c.sport,
          status,
          customerType,
          referralSourceId: referral.id,
          centreId: centre.id,
        },
      });
      clientRows.push(created);

      // Assign 1 therapist to ACTIVE clients (round-robin).
      if (status === "ACTIVE" && therapists.length > 0) {
        const therapist = therapists[i % therapists.length]!;
        await prisma.clientDoctorAssignment.create({
          data: {
            clientId: created.id,
            staffId: therapist.id,
            isPrimary: true,
          },
        });
      }
    }
    console.log(`[seed] Clients: ${clientRows.length}`);

    // ~100 appointments spread across ±2 weeks
    const now = new Date();
    let appointmentCount = 0;
    if (allServices.length > 0 && therapists.length > 0) {
      const activeClients = clientRows.filter((c) => c.status === "ACTIVE");
      for (let i = 0; i < 100; i++) {
        const client = activeClients[i % activeClients.length]!;
        const therapist = therapists[i % therapists.length]!;
        const service =
          allServices.find((s) => s.departmentId === therapist.departmentId) ??
          allServices[i % allServices.length]!;
        const dayOffset = (i % 28) - 14; // ±14 days
        const start = new Date(now);
        start.setDate(start.getDate() + dayOffset);
        start.setHours(9 + (i % 8), (i % 4) * 15, 0, 0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const status = dayOffset < 0 ? (i % 7 === 0 ? "CANCELLED" : "COMPLETED") : "CONFIRMED";
        await prisma.appointment.create({
          data: {
            clientId: client.id,
            therapistId: therapist.id,
            serviceId: service.id,
            centreId: centre.id,
            startTime: start,
            endTime: end,
            status,
            cancelledBy: status === "CANCELLED" ? (i % 2 === 0 ? "PATIENT" : "THERAPIST") : null,
          },
        });
        appointmentCount++;
      }
    }
    console.log(`[seed] Appointments: ${appointmentCount}`);

    // ~50 completed sessions
    let sessionCount = 0;
    if (allServices.length > 0) {
      const activeClients = clientRows.filter((c) => c.status === "ACTIVE");
      for (let i = 0; i < 50; i++) {
        const client = activeClients[i % activeClients.length]!;
        const therapist = therapists[i % therapists.length]!;
        const service =
          allServices.find((s) => s.departmentId === therapist.departmentId) ??
          allServices[i % allServices.length]!;
        const date = new Date(now);
        date.setDate(date.getDate() - (i % 30));
        await prisma.session.create({
          data: {
            sessionDate: date,
            status: "COMPLETED",
            clientId: client.id,
            therapistId: therapist.id,
            serviceId: service.id,
            centreId: centre.id,
            perSessionAmount: service.basePrice,
            treatmentNotes: i % 5 === 0 ? "Patient progressing well; reduced pain." : null,
          },
        });
        sessionCount++;
      }
    }
    console.log(`[seed] Sessions: ${sessionCount}`);

    // ~30 MisEntry rows: synthesise via fake invoices so MIS report has data.
    let misCount = 0;
    if (allServices.length > 0) {
      const activeClients = clientRows.filter((c) => c.status === "ACTIVE").slice(0, 12);
      for (let i = 0; i < 30; i++) {
        const client = activeClients[i % activeClients.length]!;
        const therapist = therapists[i % therapists.length]!;
        const service =
          allServices.find((s) => s.departmentId === therapist.departmentId) ??
          allServices[i % allServices.length]!;
        const dept = deptRows.find((d) => d.id === service.departmentId)?.name ?? null;
        const subtotal = service.basePrice;
        const gst = subtotal * service.gstRate;
        const total = subtotal + gst;
        const invoiceDate = new Date(now);
        invoiceDate.setDate(invoiceDate.getDate() - (i % 30));

        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber: `COL-MBD/SEED-${i.toString().padStart(4, "0")}/${(i + 1).toString().padStart(3, "0")}-${invoiceDate.getFullYear()}`,
            invoiceFlavor: "SERVICES",
            subtotal,
            totalGst: gst,
            totalAmount: total,
            paidAmount: i % 4 === 0 ? 0 : total,
            status: i % 4 === 0 ? "OVERDUE" : "PAID",
            lineItems: JSON.stringify([
              {
                service: service.name,
                consultantId: therapist.id,
                consultantName: therapist.name,
                hsnSac: service.hsnSacCode,
                qty: 1,
                perAmount: service.basePrice,
                lineDiscount: 0,
                gstRate: service.gstRate,
                lineTotal: total,
              },
            ]),
            clientId: client.id,
            centreId: centre.id,
            createdAt: invoiceDate,
          },
        });

        await prisma.misEntry.create({
          data: {
            invoiceId: invoice.id,
            invoiceLineIndex: 0,
            clientId: client.id,
            centreId: centre.id,
            centreName: centre.name,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate,
            patientName: `${client.firstName} ${client.lastName}`,
            patientType: i % 3 === 0 ? "New" : "Existing",
            customerType: client.customerType,
            consultant: therapist.name,
            service: service.name,
            department: dept,
            type: service.serviceType === "GYM" ? "Gym" : service.serviceType === "ONLINE" ? "Online" : "Clinic",
            amount: subtotal,
            amountBeforeTax: subtotal,
            gstPercent: service.gstRate * 100,
            gst,
            netPayableAmount: total,
            perSessionAmount: subtotal,
            noOfSessions: 1,
            sessionNo: 1,
            paidAmount: invoice.paidAmount,
            balanceAmount: total - invoice.paidAmount,
            modeOfPayment: invoice.paidAmount > 0 ? (i % 2 === 0 ? "UPI" : "CASH") : null,
          },
        });
        misCount++;
      }
    }
    console.log(`[seed] MisEntries: ${misCount}`);

    // 5 sample audit log rows
    if (yasir && fo) {
      const performer = yasir;
      for (let i = 0; i < 5; i++) {
        const target = clientRows[i]!;
        await prisma.auditLog.create({
          data: {
            action: "CREATE",
            entity: "Client",
            entityId: target.id,
            performedById: performer.id,
            changes: JSON.stringify({ status: { old: null, new: "DRAFT" } }),
          },
        });
      }
    }
    console.log("[seed] AuditLog: 5");
    console.log("[seed] DONE");
  } finally {
    await prisma.$disconnect();
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function inferProductCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("tape")) return "CONSUMABLE";
  if (n.includes("arthrogen") || n.includes("supplement")) return "SUPPLEMENT";
  if (n.includes("pack")) return "CONSUMABLE";
  return "EQUIPMENT";
}

function estimateProductPrice(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("theraband") || n.includes("theraloop")) return 800;
  if (n.includes("superband")) return 1200;
  if (n.includes("foam roller")) return 1500;
  if (n.includes("ball")) return 600;
  if (n.includes("hot pack") || n.includes("ice pack") || n.includes("ice bag")) return 700;
  if (n.includes("kinesio tape")) return 1200;
  if (n.includes("arthrogen")) return 950;
  if (n.includes("yoga strap")) return 600;
  return 1000;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
