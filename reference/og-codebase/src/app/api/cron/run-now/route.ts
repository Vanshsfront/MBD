// Run all cron jobs once on demand. OWNER+ADMIN+DEV only.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { isManagementRole } from "@/lib/permissions";
import { runAllOnce } from "@/lib/cron/scheduler";

export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!isManagementRole(auth.user.role) && auth.user.role !== "DEV") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const out = await runAllOnce();
  return NextResponse.json({ ok: true, ...out });
}
