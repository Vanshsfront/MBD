// Supabase session refresh helper. Called from src/middleware.ts on every
// non-static request to keep the Supabase auth cookie current. The function
// returns a NextResponse you must pass through, OR a redirect response if
// the caller wants to gate access by Supabase auth (we don't today — the
// existing NextAuth middleware handles route gating).

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request: NextRequest) => {
  // Start with the default passthrough response.
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  // If Supabase isn't configured, skip silently — the rest of the app
  // (NextAuth, Prisma) still works without it.
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touch the user — this refreshes the session token if it's stale and
  // writes the refreshed cookies back via setAll above.
  await supabase.auth.getUser();

  return supabaseResponse;
};
