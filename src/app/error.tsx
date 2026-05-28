"use client";

// Root error boundary — catches errors in non-dashboard routes (login,
// public intake, public portal) so visitors see a recoverable message
// instead of Next.js's default screen. The dashboard has its own
// dashboard/error.tsx which sits "below" this in the tree.

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-app p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[color:var(--border-light)] bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">
          Something went wrong
        </h1>
        <p className="text-sm text-[color:var(--text-secondary)]">
          We hit a snag loading this page. Retry the action or head back to the
          sign-in screen.
        </p>
        {error.digest ? (
          <p className="font-mono text-[11px] text-[color:var(--text-tertiary)]">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Try again
          </button>
          <a
            href="/login"
            className="rounded-md bg-[color:var(--text-primary)] px-3 py-1.5 text-sm font-medium text-white"
          >
            Go to sign-in
          </a>
        </div>
      </div>
    </div>
  );
}
