import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const document = await prisma.legalDocument.findFirst({
    where: { key: "TERMS_OF_SERVICE", isActive: true },
    orderBy: { effectiveDate: "desc" },
    select: {
      key: true,
      version: true,
      effectiveDate: true,
      bodyMarkdown: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "active_terms_of_service_missing" }, { status: 503 });
  }

  return NextResponse.json({
    key: document.key,
    version: document.version,
    effectiveDate: document.effectiveDate.toISOString(),
    bodyMarkdown: document.bodyMarkdown,
  });
}
