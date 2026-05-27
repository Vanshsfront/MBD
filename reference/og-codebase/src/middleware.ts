// Auth gate. Protects /dashboard/*. Redirects unauthenticated users to /login
// preserving the original destination. Public routes: /, /login, /intake/*,
// /portal/*, /api/auth/*, static assets.
//
// Also forwards the current pathname via `x-pathname` header so server
// components/layouts (e.g. DashboardShell) can highlight the active nav item.

import { NextResponse } from "next/server";
import { authEdge } from "@/lib/auth-edge";

export default authEdge((req) => {
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

  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)).*)",
  ],
};
