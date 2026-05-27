import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

// POST /api/upload — upload a file (consent photo, clinical doc, etc.)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null; // "consent-photo" | "clinical-doc"
    const clientId = formData.get("clientId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!type) {
      return NextResponse.json({ error: "Upload type is required" }, { status: 400 });
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    // Validate mime type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: JPG, PNG, WebP, PDF" }, { status: 400 });
    }

    // Generate storage path
    const ext = file.name.split(".").pop() || "jpg";
    const timestamp = Date.now();
    const path = `${type}/${clientId || "unknown"}/${timestamp}.${ext}`;

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const url = await uploadFile(path, buffer, file.type);

    if (!url) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // If this is a consent photo and we have a clientId, update the client record
    if (type === "consent-photo" && clientId) {
      await prisma.client.update({
        where: { id: clientId },
        data: { consentFormPhotoUrl: url },
      });
    }

    return NextResponse.json({ url, path }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/upload]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
