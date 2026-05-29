// Server-side Supabase Storage helpers. Wraps the admin client (service-role
// bypasses bucket RLS) so the uploader server-side handler doesn't need to
// care about who's signed in — it just stores under a deterministic path.
//
// Buckets referenced:
//   - "files"             — generic FO uploads (consent scans, misc docs)
//   - "clinical-records"  — versioned doctor write-ups, gated by signed URL
//                          (created out-of-band when #12.7 needs it)
//
// Path convention: every consumer namespaces under its model:
//   files/consent-scans/{clientId}/{uuid}.{ext}
//   files/intake-attachments/{clientId}/{uuid}.{ext}
//   clinical-records/clinical/{consultationId}/{version}.docx
// Keeping path opaque means downstream lookups don't depend on a brittle
// filename — the storagePath is stored in Prisma and treated as the truth.

import { createAdminClient } from "./admin";

export const FILES_BUCKET = "files";
export const CLINICAL_RECORDS_BUCKET = "clinical-records";

export interface UploadResult {
  bucket: string;
  path: string;
  sizeBytes: number;
}

export async function uploadFile({
  bucket,
  path,
  body,
  contentType,
  upsert = false,
}: {
  bucket: string;
  path: string;
  body: Buffer | Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  upsert?: boolean;
}): Promise<UploadResult> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, body as Blob, {
    contentType,
    upsert,
  });
  if (error) {
    throw new Error(`Supabase Storage upload failed (${bucket}/${path}): ${error.message}`);
  }
  return { bucket, path, sizeBytes: byteLengthOf(body) };
}

function byteLengthOf(body: Buffer | Blob | ArrayBuffer | Uint8Array): number {
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  // Both Buffer and Uint8Array expose byteLength — Buffer is a Uint8Array
  // subclass in Node, so this single check covers both without the union
  // intersection narrowing-to-never TS quirk.
  if (typeof (body as Uint8Array).byteLength === "number") {
    return (body as Uint8Array).byteLength;
  }
  return 0;
}

export async function signedDownloadUrl(
  bucket: string,
  path: string,
  ttlSeconds = 60 * 60, // 1 hour default
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Supabase Storage sign failed (${bucket}/${path}): ${error?.message ?? "no URL"}`,
    );
  }
  return data.signedUrl;
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Supabase Storage delete failed (${bucket}/${path}): ${error.message}`);
  }
}

// Cheap sanitiser for the filename part of a path. Strips path separators
// and anything that could escape the namespaced prefix. Keeps the extension.
export function safeFilename(name: string): string {
  const stripped = name.replace(/[^\w.\-]+/g, "_");
  return stripped.slice(0, 200) || "file";
}
