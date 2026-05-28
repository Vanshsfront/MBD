// Bulk-import services from the MBD Master Data XLSX. PRD §6 + Phase 7.
//
// Accepts multipart/form-data with a `file` field. Parses the
// ServicesMasterData sheet via the shared parser, then upserts services
// keyed on (name, departmentId, centreId). centreId is the ACTIVE centre
// (PRD §6.10), so an OWNER who switched can refresh a specific centre's
// catalog independently. Audit log per upserted row.
//
// Note: dropdown sentinel rows ("DROPDOWN OPTION LIST") and blank rows are
// stripped by the parser. The sheet's column order: Department, Consultant,
// Service Name, HSN/SAC, Base Price, GST Rate.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { activeCentreId } from "@/lib/centre";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { parseMasterDataBuffer, inferServiceType } from "@/lib/master-data";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — well above any plausible XLSX

export async function POST(req: Request) {
  const auth = await requirePermission("admin:manage_services");
  if (!auth.ok) return auth.response;

  const centreId = await activeCentreId();
  if (!centreId) {
    return NextResponse.json({ error: "no_active_centre" }, { status: 400 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }
  // Block files masquerading as XLSX. exceljs trips silently on bad input, but
  // a hostile zip could still hit historic CVEs — reject at the door.
  const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const fileType = file.type || "";
  const fileName = file.name?.toLowerCase() ?? "";
  // Some browsers omit the MIME type for File objects, especially on Windows.
  // Accept "" only if the extension is .xlsx — otherwise reject.
  const looksLikeXlsx = fileName.endsWith(".xlsx");
  if (fileType && fileType !== XLSX_MIME) {
    return NextResponse.json(
      { error: "unsupported_file_type", got: fileType, expected: XLSX_MIME },
      { status: 415 },
    );
  }
  if (!fileType && !looksLikeXlsx) {
    return NextResponse.json(
      { error: "unsupported_file_type", hint: "Upload a .xlsx file." },
      { status: 415 },
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  let parsed;
  try {
    parsed = await parseMasterDataBuffer(buf);
  } catch (err) {
    return NextResponse.json(
      { error: "parse_failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 400 },
    );
  }

  if (parsed.services.length === 0) {
    return NextResponse.json(
      { error: "no_services_found", hint: "Confirm the workbook has a 'ServicesMasterData' sheet." },
      { status: 422 },
    );
  }

  // Resolve departments once; rows whose department isn't in the DB are
  // skipped + reported so the operator can fix the source XLSX.
  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
  });
  const deptByName = new Map(departments.map((d) => [d.name, d.id]));

  const meta = requestMeta(req);

  const summary = { upserted: 0, created: 0, updated: 0, skipped: 0, unknownDepartments: [] as string[] };

  for (const svc of parsed.services) {
    const departmentId = deptByName.get(svc.department);
    if (!departmentId) {
      summary.skipped++;
      if (!summary.unknownDepartments.includes(svc.department)) {
        summary.unknownDepartments.push(svc.department);
      }
      continue;
    }

    // PRD §5: Service unique on (name, departmentId, centreId). Do an upsert
    // per row so re-imports update prices instead of creating duplicates.
    const existing = await prisma.service.findFirst({
      where: { name: svc.name, departmentId, centreId },
    });

    if (existing) {
      const updated = await prisma.service.update({
        where: { id: existing.id },
        data: {
          basePrice: svc.basePrice,
          gstRate: svc.gstRate,
          hsnSacCode: svc.hsnSac || null,
          serviceType: inferServiceType(svc.name),
        },
      });
      const changes = computeChanges(
        { basePrice: existing.basePrice, gstRate: existing.gstRate, hsnSacCode: existing.hsnSacCode },
        { basePrice: updated.basePrice, gstRate: updated.gstRate, hsnSacCode: updated.hsnSacCode },
      );
      // Only log if something actually changed — re-imports of unchanged rows
      // shouldn't pollute the audit log.
      if (changes && Object.keys(changes).length > 0) {
        await createAuditLog({
          action: "UPDATE",
          entity: "Service",
          entityId: updated.id,
          performedById: auth.user.id,
          changes,
          metadata: { source: "services-import", department: svc.department },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
      summary.updated++;
    } else {
      const created = await prisma.service.create({
        data: {
          name: svc.name,
          departmentId,
          centreId,
          basePrice: svc.basePrice,
          gstRate: svc.gstRate,
          hsnSacCode: svc.hsnSac || null,
          serviceType: inferServiceType(svc.name),
          isActive: true,
        },
      });
      await createAuditLog({
        action: "CREATE",
        entity: "Service",
        entityId: created.id,
        performedById: auth.user.id,
        metadata: { source: "services-import", department: svc.department, name: svc.name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      summary.created++;
    }
    summary.upserted++;
  }

  return NextResponse.json({ ok: true, ...summary });
}
