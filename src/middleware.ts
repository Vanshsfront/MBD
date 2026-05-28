// Auth gate. Protects /dashboard/*. Redirects unauthenticated users to /login
// preserving the original destination. Public routes: /, /login, /intake/*,
// /portal/*, /api/auth/*, static assets.
//
// Two auth layers run in this middleware:
//   1. NextAuth (the primary; gates /dashboard via authEdge)
//   2. Supabase SSR session refresh (touches getUser() so the supabase
//      auth cookie stays fresh when present). Side-by-side, not competing.
//      If NEXT_PUBLIC_SUPABASE_URL isn't set, the refresh is a no-op.

import { NextResponse } from "next/server";
import { authEdge } from "@/lib/auth-edge";
import { updateSession } from "@/utils/supabase/middleware";

export default authEdge(async (req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;

  if (pathname.startsWith("/dashboard") && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Passthrough: refresh the Supabase session cookie before handing off.
  return await updateSession(req);
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)).*)",
  ],
};
