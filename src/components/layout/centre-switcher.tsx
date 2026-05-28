"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/error-messages";

// Pathnames that include a centre-specific entity id and would 404 (or worse,
// load another centre's data) if we just refreshed in place after a switch.
// Matching is prefix-based on the SECOND path segment after /dashboard/.
const CENTRE_SCOPED_DETAIL_PATTERNS: RegExp[] = [
  /^\/dashboard\/patients\/[^/]+/, // patient detail + nested tabs
  /^\/dashboard\/billing\/invoices\/[^/]+/, // invoice detail
  /^\/dashboard\/admin\/products\/[^/]+/, // product detail
];

function isCentreScopedDetailPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return CENTRE_SCOPED_DETAIL_PATTERNS.some((re) => re.test(pathname));
}

interface CentreOption {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  centres: CentreOption[];
  activeCentreId: string | null;
  defaultCentreId: string | null;
}

export function CentreSwitcher({ centres, activeCentreId, defaultCentreId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const active = centres.find((c) => c.id === activeCentreId) ?? null;
  const isOverride = activeCentreId !== defaultCentreId;

  async function pick(centreId: string | null) {
    setPending(true);
    try {
      const res = await fetch("/api/centre-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centreId }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't switch centres." }),
        );
      }
      setOpen(false);
      // If we were viewing a centre-specific detail page (an invoice, patient,
      // product), that URL now points at data the new centre doesn't have —
      // route back to /dashboard rather than leaving the user on a 404. For
      // list/index pages, a refresh is enough.
      if (isCentreScopedDetailPath(pathname)) {
        router.replace("/dashboard");
      } else {
        router.refresh();
      }
      toast.success(centreId ? "Centre switched" : "Reset to your home centre");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Switch failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="gap-2"
        aria-expanded={open}
      >
        <span className="font-mono text-[11px]">{active?.slug ?? "—"}</span>
        <span className="hidden text-xs text-muted-foreground md:inline">
          {active?.name ?? "Pick centre"}
        </span>
        {isOverride ? (
          <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-800">
            override
          </span>
        ) : null}
        <ChevronIcon />
      </Button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-md border bg-card shadow-lg">
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Switch centre
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {centres.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pick(c.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    c.id === activeCentreId ? "bg-secondary font-medium" : ""
                  }`}
                >
                  <span>
                    <span className="font-mono text-[11px] text-muted-foreground">{c.slug}</span>
                    <span className="ml-2">{c.name}</span>
                  </span>
                  {c.id === activeCentreId ? <span className="text-xs">✓</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {isOverride ? (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => pick(null)}
                className="w-full"
              >
                Reset to home centre
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
