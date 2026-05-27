"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { IntakeFormShell, type IntakePayload } from "@/components/intake/intake-form-shell";
import { readApiError } from "@/lib/error-messages";

export function IntakeFormView({ token }: { token: string }) {
  const [submitted, setSubmitted] = useState(false);

  async function submit(payload: IntakePayload) {
    const res = await fetch(`/api/intake/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await readApiError(res, { fallback: "Couldn't submit your intake form." }));
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <h1 className="text-xl font-semibold">All done — thank you.</h1>
            <p className="text-sm text-muted-foreground">
              The front office will call you in shortly. You can close this page now.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <IntakeFormShell variant="page" submitLabel="Submit" onSubmit={submit} />;
}
