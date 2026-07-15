import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const document = await prisma.legalDocument.findFirst({
    where: { key: "TERMS_OF_SERVICE", isActive: true },
    orderBy: { effectiveDate: "desc" },
    select: { version: true, bodyMarkdown: true },
  });

  if (!document) {
    return NextResponse.json({ error: "active_terms_of_service_missing" }, { status: 503 });
  }

  return new NextResponse(document.bodyMarkdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="terms-of-service-v${document.version}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
