"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Shown when a clinical user opens a patient they're not assigned to — a clear
// blocked message with a refresh, NOT a silent redirect (OG audit fix).
export function AccessBlocked() {
  const router = useRouter();
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-4 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">Access blocked</h1>
        <p className="text-sm text-muted-foreground">
          You must be assigned to this patient via the Front Office assignment queue to open
          their records. Ask the front office to assign you, then refresh.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.refresh()}>
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/patients">Back to patients</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
