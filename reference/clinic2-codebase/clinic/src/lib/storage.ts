import { createClient } from "@supabase/supabase-js";

// ── Supabase Storage Client ──────────────────────────────────────────────
// Used for uploading/downloading files (consent photos, clinical docs, etc.)
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[Storage] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — file uploads will fail");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const BUCKET = "documents";

/**
 * Upload a file to Supabase Storage.
 * @param path - The storage path (e.g., "consent-photos/client123.jpg")
 * @param file - The file buffer
 * @param contentType - MIME type (e.g., "image/jpeg")
 * @returns The public URL or null on failure
 */
export async function uploadFile(
  path: string,
  file: Buffer,
  contentType: string
): Promise<string | null> {
  try {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error("[Storage] Upload failed:", error.message);
      return null;
    }

    // Generate a signed URL (valid for 1 year)
    const { data: signedData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 365 * 24 * 60 * 60);

    return signedData?.signedUrl || null;
  } catch (err) {
    console.error("[Storage] Upload error:", err);
    return null;
  }
}

/**
 * Get a signed URL for a file (for secure access to private bucket).
 * @param path - The storage path
 * @param expiresInSeconds - How long the URL is valid (default: 1 hour)
 */
export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      console.error("[Storage] Signed URL failed:", error.message);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error("[Storage] Signed URL error:", err);
    return null;
  }
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(path: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      console.error("[Storage] Delete failed:", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
