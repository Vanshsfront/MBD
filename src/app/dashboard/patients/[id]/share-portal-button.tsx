"use client";

// "Share portal link" — generates a fresh ClientPortalToken and copies the
// URL to the clipboard. Auto-revokes the previous token (server-side).

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/error-messages";

export function SharePortalButton({ clientId }: { clientId: string }) {
  const [pending, setPending] = useState(false);
  const [shared, setShared] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-token`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't generate a portal link." }),
        );
      }
      const out = (await res.json()) as { token: string; expiresAt: string };
      const url = `${window.location.origin}/portal/${out.token}`;
      // Best-effort clipboard write — falls back to manual copy via the
      // input rendered below.
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Portal link copied to clipboard");
      } catch {
        toast.message("Link generated — copy manually below");
      }
      setShared(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" onClick={generate} disabled={pending}>
        {pending ? "Generating…" : shared ? "Generate new link" : "Share portal link"}
      </Button>
      {shared ? (
        <input
          readOnly
          value={shared}
          onClick={(e) => e.currentTarget.select()}
          className="h-8 w-full rounded-md border border-input bg-muted/40 px-2 font-mono text-[11px]"
        />
      ) : null}
    </div>
  );
}
