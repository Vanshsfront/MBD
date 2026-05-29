"use client";

// Filter chrome for the patients list — search + status segments.
// URL-driven so SSR keeps the patient query authoritative; this component
// just pushes the user's intent into the URL and the server re-renders.

import { useTransition, useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";

const SEGMENTS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "vip", label: "VIP" },
] as const;

type Segment = (typeof SEGMENTS)[number]["value"];

export function PatientsFilterBar({ totalCount }: { totalCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams?.get("q") ?? "");
  const segment = ((searchParams?.get("filter") ?? "active") as Segment);

  // Debounce search updates to URL so we're not navigating on every keystroke.
  useEffect(() => {
    const current = searchParams?.get("q") ?? "";
    if (search === current) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (search) params.set("q", search);
      else params.delete("q");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }, 280);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setSegment(next: Segment) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "active") params.delete("filter");
    else params.set("filter", next);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-[color:var(--border-light)] shadow-[0_1px_2px_0_var(--shadow-color),0_4px_16px_-6px_var(--shadow-color)]">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-[color:var(--border)] bg-secondary px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-[color:var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            placeholder="Search by name, phone, or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[color:var(--text-tertiary)]"
          />
        </label>
        <div className="inline-flex overflow-hidden rounded-lg border border-[color:var(--border)] bg-secondary">
          {SEGMENTS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSegment(s.value)}
              className={`border-r border-[color:var(--border)] px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0 ${
                segment === s.value
                  ? "bg-card font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[color:var(--text-tertiary)]">
          {totalCount} match{totalCount === 1 ? "" : "es"}
        </span>
      </div>
    </div>
  );
}
