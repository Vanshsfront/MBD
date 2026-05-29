// POST  — Upload a new doctor write-up version for a consultation.
// GET   — List existing attachment versions with short-lived signed URLs.
//
// Round-trip the user wants:
//   1. Therapist renders consultation as DOCX (existing /render endpoint)
//   2. Edits in Word offline
//   3. Uploads back via this endpoint
//   4. The upload is stored in Supabase Storage under
//      clinical/{consultationId}/v{N}.{ext} and a ConsultationAttachment
//      row is written; older rows for the same consultation have their
//      isCurrent flipped to false.
//
// Access control:
//   - Author consultant, OWNER, ADMIN, DEV may write + read
//   - Other clinical roles get 403
//   - FO + non-clinical staff cannot upload but may read for their
//     billing/intake duties (matches the existing patients:view_all gate)

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Role } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import {
  FILES_BUCKET,
  safeFilename,
  signedDownloadUrl,
  uploadFile,
} from "@/utils/supabase/storage";

// 25 MB cap matches the deferred-design doc in mbd-docs/PUNCHLIST.md §2.
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED_MIME = new Set<string>([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc (legacy)
  "application/pdf",
]);

function clinicalPath(consultationId: string, version: number, ext: string): string {
  return `clinical/${consultationId}/v${version}.${ext.replace(/[^a-z0-9]/gi, "") || "bin"}`;
}

function extOf(filename: string, mime: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot > -1 && dot < filename.length - 1) return filename.slice(dot + 1).toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime === "application/msword") return "doc";
  return "bin";
}

async function canEditConsultation(
  consultationId: string,
  userId: string,
  role: Role,
): Promise<{ ok: boolean; reason?: string }> {
  if (role === "OWNER" || role === "ADMIN" || role === "DEV") return { ok: true };
  const row = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { consultantId: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consultantId === userId) return { ok: true };
  return { ok: false, reason: "forbidden" };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as Role;
  const { id } = await context.params;

  const gate = await canEditConsultation(id, session.user.id, role);
  if (!gate.ok) {
    const status = gate.reason === "not_found" ? 404 : 403;
    return NextResponse.json({ error: gate.reason ?? "Forbidden" }, { status });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Multipart body required" }, { status: 400 });
  }
  const file = formData.get("file");
  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim().slice(0, 500) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large — max ${MAX_BYTES / (1024 * 1024)} MB` },
      { status: 400 },
    );
  }
  if (!ACCEPTED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        error: "Only DOCX, DOC, and PDF uploads are accepted for clinical write-ups.",
      },
      { status: 400 },
    );
  }

  // Atomic version bump + isCurrent flip. We do the upload OUTSIDE the
  // transaction (Storage isn't transactional), then write the row. On a
  // partial failure the orphan blob is cheap to clean up out-of-band.
  const latestVersion = await prisma.consultationAttachment.aggregate({
    where: { consultationId: id },
    _max: { version: true },
  });
  const nextVersion = (latestVersion._max.version ?? 0) + 1;

  const ext = extOf(file.name, file.type);
  const storagePath = clinicalPath(id, nextVersion, ext);
  const buf = Buffer.from(await file.arrayBuffer());

  await uploadFile({
    bucket: FILES_BUCKET,
    path: storagePath,
    body: buf,
    contentType: file.type,
    upsert: false,
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.consultationAttachment.updateMany({
      where: { consultationId: id, isCurrent: true },
      data: { isCurrent: false },
    });
    return tx.consultationAttachment.create({
      data: {
        consultationId: id,
        version: nextVersion,
        filename: safeFilename(file.name),
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath,
        uploadedById: session.user.id,
        notes,
        isCurrent: true,
      },
      select: { id: true, version: true, uploadedAt: true },
    });
  });

  await createAuditLog({
    action: "CREATE",
    entity: "Consultation",
    entityId: id,
    performedById: session.user.id,
    metadata: {
      type: "attachment",
      attachmentId: created.id,
      version: created.version,
      sizeBytes: file.size,
      mimeType: file.type,
      filename: file.name,
    },
  });

  return NextResponse.json({
    attachmentId: created.id,
    version: created.version,
    uploadedAt: created.uploadedAt.toISOString(),
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as Role;
  if (!hasPermission(role, "patients:view_assigned")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;

  const rows = await prisma.consultationAttachment.findMany({
    where: { consultationId: id },
    orderBy: { version: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  // Sign download URLs server-side. Each URL is fresh on every list call —
  // 1h TTL is plenty for clicking through and downloading.
  const attachments = await Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      version: a.version,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      isCurrent: a.isCurrent,
      uploadedAt: a.uploadedAt.toISOString(),
      uploadedBy: a.uploadedBy?.name ?? null,
      notes: a.notes,
      downloadUrl: await signedDownloadUrl(FILES_BUCKET, a.storagePath, 60 * 60),
    })),
  );

  return NextResponse.json({ attachments });
}
