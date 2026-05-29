// Privileged Supabase client — bypasses RLS via the service-role key.
// Use ONLY in server-side code (Route Handlers, server actions). Never
// import this in a "use client" file or pass the returned client to one;
// the service-role key must stay on the server.
//
// Env required:
//   NEXT_PUBLIC_SUPABASE_URL   — same project URL the public client uses
//   SUPABASE_SERVICE_ROLE_KEY  — the rotated service-role JWT (.env.local)

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin env missing: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.",
    );
  }
  // No cookie/session — service role uses the key directly. autoRefreshToken
  // off because there's no user session to refresh; persistSession off so we
  // don't accidentally write tokens to local storage in non-prod harnesses.
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
