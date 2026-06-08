// FO creates a package from a therapist's recommendations. The same call
// optionally spawns an Invoice (Services flavor) so the FO can collect
// payment in one shot.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta, assertCentreScope } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { computeInvoiceTotals } from "@/lib/discount";

const createSchema = z.object({
  clientId: z.string().min(1),
  consultationId: z.string().optional(),
  serviceMix: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        count: z.number().int().min(1).max(50),
      }),
    )
    .min(1),
  validFromIso: z.string().datetime().optional(),
  validUntilIso: z.string().datetime().optional(),
  expiryWarningDays: z.number().int().min(0).max(180).default(14),
  discountPercent: z.number().min(0).max(100).default(0),
  promotionCode: z.string().optional(),
  /** When true, also create an Invoice + MisEntry rows for this package. */
  spawnInvoice: z.boolean().default(true),
});

export async function POST(req: Request) {
  const auth = await requirePermission("billing:edit_packages");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const client = await prisma.client.findUnique({
    where: { id: f.clientId },
    include: { centre: true, referralSource: true },
  });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  if (!client.centre)
    return NextResponse.json({ error: "client_has_no_centre" }, { status: 400 });
  const scope = await assertCentreScope(auth.user, client);
  if (scope) return scope;

  // Resolve the actual consultant from the originating Consultation (if provided).
  // Falls back to the package creator (FO) so the MIS row never carries a department
  // name in the consultant column.
  const consultation = f.consultationId
    ? await prisma.consultation.findUnique({
        where: { id: f.consultationId },
        select: { id: true, consultantId: true, consultant: { select: { name: true } } },
      })
    : null;
  const resolvedConsultantId = consultation?.consultantId ?? auth.user.id;
  const resolvedConsultantName =
    consultation?.consultant?.name ?? auth.user.name ?? "—";

  // patientType: "New" when this is the client's first invoice in the centre,
  // else "Existing". The customerType==WALK_IN heuristic is wrong (a returning
  // walk-in is still Existing).
  const priorInvoiceCount = await prisma.invoice.count({
    where: { clientId: f.clientId, centreId: client.centre.id },
  });
  const resolvedPatientType = priorInvoiceCount === 0 ? "New" : "Existing";

  const services = await prisma.service.findMany({
    where: { id: { in: f.serviceMix.map((s) => s.serviceId) } },
    include: { department: { select: { name: true } } },
  });
  const svcById = new Map(services.map((s) => [s.id, s]));

  // Validate all service ids resolved.
  for (const item of f.serviceMix) {
    if (!svcById.has(item.serviceId)) {
      return NextResponse.json(
        { error: "service_not_found", serviceId: item.serviceId },
        { status: 400 },
      );
    }
  }

  const promo = f.promotionCode
    ? await prisma.promotion.findUnique({ where: { code: f.promotionCode } })
    : null;

  // Compute totals.
  const lineForCalc = f.serviceMix.map((item) => {
    const svc = svcById.get(item.serviceId)!;
    const qty = item.count * svc.participantCount;
    return {
      qty,
      perAmount: svc.basePrice,
      lineDiscountFraction: 0,
      gstRate: svc.gstRate,
    };
  });

  const totals = computeInvoiceTotals({
    lines: lineForCalc,
    additionalDiscount:
      f.discountPercent > 0 ? { type: "PERCENT" as const, value: f.discountPercent } : undefined,
    promotion:
      promo && promo.isActive
        ? {
            type: promo.discountType as "PERCENT" | "FLAT",
            value: promo.discountValue,
            maxAmount: promo.maxDiscount,
          }
        : undefined,
  });

  const totalSessions = f.serviceMix.reduce((n, x) => n + x.count, 0);
  const validFrom = f.validFromIso ? new Date(f.validFromIso) : new Date();
  const validUntil = f.validUntilIso
    ? new Date(f.validUntilIso)
    : new Date(validFrom.getTime() + 90 * 24 * 3600 * 1000);

  const meta = requestMeta(req);

  const result = await prisma.$transaction(async (tx) => {
    const pkg = await tx.package.create({
      data: {
        clientId: f.clientId,
        consultationId: f.consultationId ?? null,
        totalSessions,
        completedSessions: 0,
        serviceMix: JSON.stringify(
          f.serviceMix.map((item) => {
            const svc = svcById.get(item.serviceId)!;
            return {
              serviceId: svc.id,
              serviceName: svc.name,
              count: item.count,
              participantCount: svc.participantCount,
              perAmount: svc.basePrice,
            };
          }),
        ),
        validFrom,
        validUntil,
        status: "ACTIVE",
        totalPrice: totals.totalAmount,
        discountPercent: f.discountPercent,
        discountAmount: totals.discountAmount,
        expiryWarningDays: f.expiryWarningDays,
      },
    });

    let invoice: Awaited<ReturnType<typeof tx.invoice.create>> | null = null;
    if (f.spawnInvoice) {
      const numberAlloc = await allocateInvoiceNumber({
        centreId: client.centre!.id,
        centreSlug: client.centre!.slug,
      });

      const lineItems = f.serviceMix.map((item) => {
        const svc = svcById.get(item.serviceId)!;
        const qty = item.count * svc.participantCount;
        return {
          service: svc.name,
          serviceId: svc.id,
          consultantId: resolvedConsultantId,
          consultantName: resolvedConsultantName,
          hsnSac: svc.hsnSacCode ?? null,
          qty,
          perAmount: svc.basePrice,
          lineDiscount: 0,
          gstRate: svc.gstRate,
          lineTotal: svc.basePrice * qty,
        };
      });

      invoice = await tx.invoice.create({
        data: {
          invoiceNumber: numberAlloc.invoiceNumber,
          invoiceFlavor: "SERVICES",
          subtotal: totals.subtotal,
          totalGst: totals.totalGst,
          totalAmount: totals.totalAmount,
          paidAmount: 0,
          discountPercent: f.discountPercent,
          discountAmount: totals.discountAmount,
          discountType: "PERCENT",
          promotionId: promo?.id ?? null,
          promotionCode: promo?.code ?? null,
          promotionDiscount: totals.promotionDiscount,
          status: "SENT",
          lineItems: JSON.stringify(lineItems),
          clientId: f.clientId,
          packageId: pkg.id,
          centreId: client.centre!.id,
        },
      });

      // MIS snapshots — one per line item. Allocate the invoice-level discount
      // (additional + promo) by computeInvoiceTotals' ratio so MIS reconciles
      // to the invoice total and the discount column reflects reality.
      const misRound2 = (n: number) => Math.round(n * 100) / 100;
      const misRatio = totals.subtotal > 0 ? totals.amountBeforeTax / totals.subtotal : 1;
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i]!;
        const gross = li.qty * li.perAmount;
        const lineAfterAll = misRound2(gross * misRatio);
        const lineGst = misRound2(lineAfterAll * li.gstRate);
        const lineNet = misRound2(lineAfterAll + lineGst);
        await tx.misEntry.create({
          data: {
            invoiceId: invoice.id,
            invoiceLineIndex: i,
            clientId: f.clientId,
            centreId: client.centre!.id,
            centreName: client.centre!.name,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.createdAt,
            patientName: `${client.firstName} ${client.lastName}`,
            patientType: resolvedPatientType,
            customerType: client.customerType,
            referralSourceName: client.referralSource?.name ?? client.referredByName ?? null,
            consultantId: resolvedConsultantId,
            consultant: resolvedConsultantName,
            service: li.service,
            department: svcById.get(li.serviceId)?.department?.name ?? null,
            type:
              svcById.get(li.serviceId)?.serviceType === "GYM"
                ? "Gym"
                : svcById.get(li.serviceId)?.serviceType === "ONLINE"
                  ? "Online"
                  : svcById.get(li.serviceId)?.serviceType === "HOME_VISIT"
                    ? "HomeVisit"
                    : "Clinic",
            amount: misRound2(gross),
            discount: misRound2(gross - lineAfterAll),
            amountBeforeTax: lineAfterAll,
            gstPercent: li.gstRate * 100,
            gst: lineGst,
            netPayableAmount: lineNet,
            perSessionAmount: li.perAmount,
            noOfSessions: li.qty,
            sessionNo: 1,
            paidAmount: 0,
            balanceAmount: lineNet,
          },
        });
      }
    }

    return { pkg, invoice };
  });

  await createAuditLog({
    action: "CREATE",
    entity: "Package",
    entityId: result.pkg.id,
    performedById: auth.user.id,
    metadata: {
      clientId: f.clientId,
      totalSessions,
      totalPrice: totals.totalAmount,
      consultationId: f.consultationId,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  if (result.invoice) {
    await createAuditLog({
      action: "CREATE",
      entity: "Invoice",
      entityId: result.invoice.id,
      performedById: auth.user.id,
      metadata: {
        invoiceNumber: result.invoice.invoiceNumber,
        clientId: f.clientId,
        packageId: result.pkg.id,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.json({
    ok: true,
    packageId: result.pkg.id,
    invoiceId: result.invoice?.id ?? null,
    invoiceNumber: result.invoice?.invoiceNumber ?? null,
    totalAmount: totals.totalAmount,
  });
}
