// Create or update a Consultation. The shape of `formData` depends on
// templateKey and is validated by the form UI on the client; the server
// just persists it as JSON. Status flow: DRAFT → COMPLETED → LOCKED.
// Once status=COMPLETED the record is append-only — only OWNER can edit
// (PRD §3.2 Q2).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { DOCX_TEMPLATES, type DocxTemplateKey } from "@/lib/templates/keys";
import {
  CLINICAL_SCHEMAS,
  RecommendationsSchema,
} from "@/lib/clinical-schemas";

const TEMPLATE_KEYS = Object.keys(DOCX_TEMPLATES) as Array<keyof typeof DOCX_TEMPLATES>;

const createSchema = z.object({
  clientId: z.string().min(1),
  templateKey: z.enum(TEMPLATE_KEYS as [string, ...string[]]),
  formData: z.record(z.string(), z.unknown()),
  chiefComplaints: z.string().max(2000).optional(),
  diagnosis: z.string().max(2000).optional(),
  planOfCare: z.string().max(4000).optional(),
  treatmentProtocol: z.string().max(4000).optional(),
  recommendedSessions: z.number().int().min(0).max(200).optional(),
  // Structured service mix the FO converts into a Package on Phase 5's
  // packages page. JSON-stringified onto Consultation.recommendedServicesJson.
  recommendedServices: RecommendationsSchema.optional(),
  followUp: z.string().max(2000).optional(),
  serviceId: z.string().optional(),
  status: z.enum(["DRAFT", "COMPLETED"]).default("DRAFT"),
});

const updateSchema = createSchema.partial().extend({ id: z.string().min(1) });

/**
 * Per-templateKey validation of `formData`. Treats parse failures as
 * 422 (`form_data_invalid`) and surfaces the first issue path so the form
 * can deep-link.
 */
function validateFormDataForTemplate(
  templateKey: string,
  formData: Record<string, unknown>,
): { ok: true; data: Record<string, unknown> } | { ok: false; issues: z.core.$ZodIssue[] } {
  const schema = CLINICAL_SCHEMAS[templateKey as DocxTemplateKey];
  if (!schema) return { ok: true, data: formData };
  const r = schema.safeParse(formData);
  if (!r.success) return { ok: false, issues: r.error.issues };
  return { ok: true, data: r.data as Record<string, unknown> };
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.user.role, "patients:edit_clinical_record_own")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // Clinical roles can only create on patients assigned to them.
  if (isClinicalRole(auth.user.role)) {
    const assigned = await prisma.clientDoctorAssignment.findFirst({
      where: { clientId: f.clientId, staffId: auth.user.id, endedAt: null },
    });
    if (!assigned) return NextResponse.json({ error: "not_assigned" }, { status: 403 });
  }

  // Per-templateKey shape validation. Anything that doesn't match the
  // template's expected fields is rejected so we don't silently persist
  // garbage that the renderer can't fill.
  const v = validateFormDataForTemplate(f.templateKey, f.formData);
  if (!v.ok) {
    return NextResponse.json(
      { error: "form_data_invalid", templateKey: f.templateKey, issues: v.issues },
      { status: 422 },
    );
  }

  // Two-tab race guard: if this consultant already has an open DRAFT for the
  // same client + template, update it instead of minting a parallel row. The
  // Prisma schema can't express a partial unique (WHERE status='DRAFT') so the
  // window is best-closed at the app layer with a transactional read-then-
  // upsert. Saves a session from accidental "twin draft" rows when the user
  // opens the same patient in two tabs.
  const consultation = await prisma.$transaction(async (tx) => {
    const existingDraft = await tx.consultation.findFirst({
      where: {
        clientId: f.clientId,
        consultantId: auth.user.id,
        templateKey: f.templateKey,
        status: "DRAFT",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingDraft) {
      return tx.consultation.update({
        where: { id: existingDraft.id },
        data: {
          formData: JSON.stringify(v.data),
          chiefComplaints: f.chiefComplaints ?? null,
          diagnosis: f.diagnosis ?? null,
          planOfCare: f.planOfCare ?? null,
          treatmentProtocol: f.treatmentProtocol ?? null,
          recommendedSessions: f.recommendedSessions ?? null,
          recommendedServicesJson: f.recommendedServices
            ? JSON.stringify(f.recommendedServices)
            : null,
          followUp: f.followUp ?? null,
          serviceId: f.serviceId ?? null,
          status: f.status,
        },
      });
    }

    return tx.consultation.create({
      data: {
        clientId: f.clientId,
        consultantId: auth.user.id,
        templateKey: f.templateKey,
        formData: JSON.stringify(v.data),
        chiefComplaints: f.chiefComplaints ?? null,
        diagnosis: f.diagnosis ?? null,
        planOfCare: f.planOfCare ?? null,
        treatmentProtocol: f.treatmentProtocol ?? null,
        recommendedSessions: f.recommendedSessions ?? null,
        recommendedServicesJson: f.recommendedServices
          ? JSON.stringify(f.recommendedServices)
          : null,
        followUp: f.followUp ?? null,
        serviceId: f.serviceId ?? null,
        status: f.status,
      },
    });
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Consultation",
    entityId: consultation.id,
    performedById: auth.user.id,
    metadata: {
      clientId: f.clientId,
      templateKey: f.templateKey,
      status: f.status,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, consultationId: consultation.id });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.user.role, "patients:edit_clinical_record_own")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.consultation.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Append-only after COMPLETED. Only OWNER (PRD §3.2 Q2) can re-edit.
  if (existing.status === "COMPLETED" || existing.status === "LOCKED") {
    if (!hasPermission(auth.user.role, "patients:edit_completed_clinical_record")) {
      return NextResponse.json({ error: "locked" }, { status: 423 });
    }
  }

  // Authoring restriction: only the consultant who created it (or OWNER) can edit.
  if (
    existing.consultantId !== auth.user.id &&
    !hasPermission(auth.user.role, "patients:edit_completed_clinical_record")
  ) {
    return NextResponse.json({ error: "not_author" }, { status: 403 });
  }

  // Validate formData against the row's templateKey when provided.
  let validatedFormData: Record<string, unknown> | undefined;
  if (f.formData) {
    const v = validateFormDataForTemplate(existing.templateKey, f.formData);
    if (!v.ok) {
      return NextResponse.json(
        {
          error: "form_data_invalid",
          templateKey: existing.templateKey,
          issues: v.issues,
        },
        { status: 422 },
      );
    }
    validatedFormData = v.data;
  }

  const updated = await prisma.consultation.update({
    where: { id: f.id },
    data: {
      ...(validatedFormData ? { formData: JSON.stringify(validatedFormData) } : {}),
      ...(f.chiefComplaints !== undefined ? { chiefComplaints: f.chiefComplaints } : {}),
      ...(f.diagnosis !== undefined ? { diagnosis: f.diagnosis } : {}),
      ...(f.planOfCare !== undefined ? { planOfCare: f.planOfCare } : {}),
      ...(f.treatmentProtocol !== undefined ? { treatmentProtocol: f.treatmentProtocol } : {}),
      ...(f.recommendedSessions !== undefined ? { recommendedSessions: f.recommendedSessions } : {}),
      ...(f.recommendedServices !== undefined
        ? {
            recommendedServicesJson: f.recommendedServices.length
              ? JSON.stringify(f.recommendedServices)
              : null,
          }
        : {}),
      ...(f.followUp !== undefined ? { followUp: f.followUp } : {}),
      ...(f.serviceId !== undefined ? { serviceId: f.serviceId } : {}),
      ...(f.status ? { status: f.status } : {}),
    },
  });

  const changes = computeChanges(
    {
      status: existing.status,
      recommendedSessions: existing.recommendedSessions,
      diagnosis: existing.diagnosis,
    },
    {
      status: updated.status,
      recommendedSessions: updated.recommendedSessions,
      diagnosis: updated.diagnosis,
    },
  );
  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Consultation",
    entityId: f.id,
    performedById: auth.user.id,
    changes,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, consultationId: updated.id });
}
