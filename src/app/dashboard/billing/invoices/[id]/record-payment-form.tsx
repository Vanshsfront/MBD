"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/error-messages";

const METHODS = ["CASH", "CARD", "UPI", "NEFT", "CHEQUE", "RAZORPAY", "OTHER"] as const;

export function RecordPaymentForm({
  invoiceId,
  remaining,
}: {
  invoiceId: string;
  remaining: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);

  // Inline guards mirror the server (which now rejects > outstanding + 0.01).
  // Keeping the button disabled and showing the reason avoids the round-trip
  // toast and protects against the historical "silent overpayment" bug.
  const parsedAmount = Number(amount);
  const isFinite = Number.isFinite(parsedAmount);
  const isPositive = isFinite && parsedAmount > 0;
  const isOverpayment = isFinite && parsedAmount > remaining + 0.01;
  const inlineHint = !isFinite
    ? "Enter a valid amount."
    : !isPositive
      ? "Amount must be greater than zero."
      : isOverpayment
        ? `That's ₹${(parsedAmount - remaining).toFixed(2)} more than the outstanding ₹${remaining.toFixed(2)}.`
        : null;
  const cannotSubmit = pending || !isPositive || isOverpayment;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isPositive) {
      toast.error("Enter a valid amount");
      return;
    }
    if (isOverpayment) {
      toast.error(inlineHint ?? "Amount exceeds outstanding");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          amount: parsedAmount,
          method,
          reference: reference.trim() || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't record the payment." }));
      }
      toast.success("Payment recorded");
      router.refresh();
      setReference("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={isOverpayment || (isFinite && !isPositive) ? true : undefined}
              aria-describedby={inlineHint ? "pay-amount-hint" : undefined}
              required
            />
            <p
              className="text-xs text-muted-foreground"
              id={inlineHint ? "pay-amount-hint" : undefined}
            >
              {inlineHint ? (
                <span className="font-medium text-amber-700">{inlineHint}</span>
              ) : (
                <>Outstanding: ₹{remaining.toFixed(2)}</>
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as (typeof METHODS)[number])}
            >
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI txn id, cheque #, etc."
            />
          </div>
          <Button type="submit" disabled={cannotSubmit} className="w-full">
            {pending ? "Recording…" : "Record"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
