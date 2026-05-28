// Server-side Supabase client. Use this inside server components, server
// actions, and Route Handlers that need to talk to Supabase as the current
// user (cookie-bound). For privileged operations that must bypass RLS, use
// admin.ts instead.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.",
    );
  }
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll called from a Server Component — ignored when the
          // middleware (utils/supabase/middleware.ts) keeps sessions fresh.
        }
      },
    },
  });
};
