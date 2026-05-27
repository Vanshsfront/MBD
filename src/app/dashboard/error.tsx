"use client";

// On-brand error boundary for the dashboard. Catches render/data errors so a
// thrown page shows a recoverable card instead of Next's default error screen.

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] route error:", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-4 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This screen hit an error. You can retry, or head back to the dashboard. If it keeps
          happening, share the reference below with support.
        </p>
        {error.digest ? (
          <p className="font-mono text-[11px] text-[color:var(--text-tertiary)]">ref: {error.digest}</p>
        ) : null}
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => reset()}>Try again</Button>
          <Button asChild>
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
