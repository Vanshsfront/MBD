"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";

interface ProformaLineItem {
  name: string;
  qty: number;
  perAmount: number;
  gstRate: number;
  lineTotal: number;
}

interface Proforma {
  id: string;
  invoiceNumber: string;
  validTill: string | null;
  totalAmount: number;
  lineItems: ProformaLineItem[];
}

export function ProformaSection({
  proformas,
  token,
}: {
  proformas: Proforma[];
  token: string;
}) {
  const [selectedByInvoice, setSelectedByInvoice] = useState<
    Record<string, Set<string>>
  >({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  function toggleItem(invoiceId: string, itemName: string) {
    setSelectedByInvoice((prev) => {
      const current = prev[invoiceId] ?? new Set();
      const next = new Set(current);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return { ...prev, [invoiceId]: next };
    });
  }

  async function handleSubmit(invoiceId: string) {
    const selected = Array.from(selectedByInvoice[invoiceId] ?? new Set());
    if (selected.length === 0) {
      toast.error("Please select at least one service");
      return;
    }

    setSubmitting(invoiceId);
    try {
      const res = await fetch(`/api/portal/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          selected,
          note: note[invoiceId] || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit interest");
      }

      toast.success("Thanks! The front office will contact you soon.");
      setSelectedByInvoice((prev) => ({
        ...prev,
        [invoiceId]: new Set(),
      }));
      setNote((prev) => ({ ...prev, [invoiceId]: "" }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not submit interest",
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suggested services (Proforma — not a bill)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {proformas.map((pf) => {
          const validTillDate = pf.validTill
            ? new Date(pf.validTill)
            : null;
          const isExpired =
            validTillDate && validTillDate < new Date();

          return (
            <div key={pf.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">
                    {pf.invoiceNumber}
                  </p>
                  {validTillDate && (
                    <p className="text-xs text-muted-foreground">
                      Valid till{" "}
                      {validTillDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {isExpired && " (expired)"}
                    </p>
                  )}
                </div>
                <p className="text-base font-semibold tabular-nums">
                  {formatINR(pf.totalAmount)}
                </p>
              </div>

              <div className="space-y-2">
                {pf.lineItems.map((li, idx) => (
                  <label
                    key={idx}
                    className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedByInvoice[pf.id]?.has(li.name) ?? false
                      }
                      onChange={() => toggleItem(pf.id, li.name)}
                      disabled={isExpired ?? false}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium break-words">{li.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {li.qty} × {formatINR(li.perAmount)}
                        {li.gstRate > 0 && ` + ${(li.gstRate * 100).toFixed(0)}% GST`}
                        {" = "}
                        {formatINR(li.lineTotal)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              {!isExpired && (
                <div className="space-y-2 border-t pt-3">
                  <textarea
                    placeholder="Optional note (e.g., preferred time, questions)"
                    value={note[pf.id] || ""}
                    onChange={(e) =>
                      setNote((prev) => ({
                        ...prev,
                        [pf.id]: e.target.value,
                      }))
                    }
                    className="h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder-muted-foreground"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSubmit(pf.id)}
                    disabled={
                      submitting === pf.id ||
                      !selectedByInvoice[pf.id]?.size
                    }
                  >
                    {submitting === pf.id
                      ? "Sending…"
                      : "Tell the front office what I want"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
