"use client";

// Real-time refresher for the assignment queue. Subscribes to Supabase
// Realtime updates on IntakeToken — when a patient finishes the public
// /intake/[token] form, the token flips PENDING → COMPLETED and a new
// Client row lands with status=DRAFT. Either trigger refreshes the SSR
// page so the FO sees the new draft instantly without a page reload.
//
// Requires:
//   - Supabase Realtime enabled on the IntakeToken table (and Client table
//     if you want the same instant pop for on-behalf flows). Enable in
//     Supabase Dashboard → Database → Replication → manage source.
//   - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in
//     .env / .env.local (already wired per src/utils/supabase/client.ts).
//
// If Realtime isn't enabled, the subscription silently no-ops; the page
// still works manually via reload.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function IntakeQueueRefresher() {
  const router = useRouter();

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      // Env not configured — fail-soft, no realtime.
      return;
    }

    const channel = supabase
      .channel("intake-queue-watch")
      // Token completion (patient finished the form).
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "IntakeToken" },
        (payload) => {
          const next = (payload.new as { status?: string } | null)?.status;
          if (next === "COMPLETED") router.refresh();
        },
      )
      // New DRAFT Client (covers the on-behalf path too).
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Client" },
        (payload) => {
          const status = (payload.new as { status?: string } | null)?.status;
          if (status === "DRAFT") router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  // Render-less — pure side-effect.
  return null;
}
