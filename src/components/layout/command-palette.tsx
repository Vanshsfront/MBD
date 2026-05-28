"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { formatINR } from "@/lib/utils";
import type { Role } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

interface SearchResults {
  patients: Array<{
    id: string;
    name: string;
    clientCode: string;
    phone: string;
    status: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    client: string;
    status: string;
    totalAmount: number;
  }>;
  appointments: Array<{
    id: string;
    patientName: string;
    patientId: string;
    therapistName: string;
    serviceName: string;
    startTime: string;
    status: string;
  }>;
}

interface QuickAction {
  label: string;
  hint: string;
  href: string;
  permission?: Parameters<typeof hasPermission>[1];
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Generate intake QR", hint: "FO", href: "/dashboard/intake", permission: "patients:generate_intake_qr" },
  { label: "Open assignment queue", hint: "FO", href: "/dashboard/assign", permission: "patients:assign_therapist" },
  { label: "Open calendar", hint: "calendar", href: "/dashboard/calendar", permission: "appointments:view_calendar_all" },
  { label: "Patient directory", hint: "patients", href: "/dashboard/patients", permission: "patients:view_assigned" },
  { label: "Invoices", hint: "billing", href: "/dashboard/billing/invoices", permission: "billing:view_invoices" },
  { label: "Payments", hint: "billing", href: "/dashboard/billing/payments", permission: "billing:view_payments" },
  { label: "Packages", hint: "billing", href: "/dashboard/billing/packages", permission: "billing:view_packages" },
  { label: "Sessions", hint: "clinical", href: "/dashboard/sessions", permission: "patients:view_assigned" },
  { label: "MIS dashboard", hint: "report", href: "/dashboard/reports/mis", permission: "reports:mis" },
  { label: "Audit log", hint: "admin", href: "/dashboard/admin/audit", permission: "admin:audit_log" },
  { label: "Profile / signature", hint: "settings", href: "/dashboard/settings/profile" },
  { label: "Raise change request", hint: "clinician", href: "/dashboard/change-requests/new", permission: "appointments:request_change" },
];

export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const allowedActions = useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.permission || hasPermission(role, a.permission)),
    [role],
  );

  // Cmd/Ctrl+K to open.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced fetch on query change. State updates run inside the
  // setTimeout callback (React 19 disallows synchronous setState in an
  // effect body); the empty-query reset uses queueMicrotask for the same
  // reason.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      queueMicrotask(() => setResults(null));
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`search failed (${res.status})`);
        const data = (await res.json()) as SearchResults;
        setResults(data);
      } catch {
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <Command
        loop
        className="w-full max-w-xl overflow-hidden rounded-lg border bg-card shadow-2xl"
        label="Global search"
      >
        <div className="flex items-center border-b px-3">
          <SearchIcon />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search patients, invoices, appointments…"
            autoFocus
            className="flex h-12 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query.length < 2
              ? "Type at least 2 characters to search."
              : searching
                ? "Searching…"
                : "No results."}
          </Command.Empty>

          {results?.patients?.length ? (
            <Command.Group heading="Patients" className="px-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {results.patients.map((p) => (
                <Command.Item
                  key={p.id}
                  value={`patient ${p.name} ${p.clientCode}`}
                  onSelect={() => go(`/dashboard/patients/${p.id}`)}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-accent"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.clientCode} · {p.phone}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {results?.invoices?.length ? (
            <Command.Group heading="Invoices" className="px-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {results.invoices.map((i) => (
                <Command.Item
                  key={i.id}
                  value={`invoice ${i.invoiceNumber} ${i.client}`}
                  onSelect={() => go(`/dashboard/billing/invoices/${i.id}`)}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-accent"
                >
                  <span className="font-mono">{i.invoiceNumber}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{i.client}</span>
                  <span className="ml-2 text-xs tabular-nums">{formatINR(i.totalAmount)}</span>
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">{i.status}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {results?.appointments?.length ? (
            <Command.Group heading="Appointments" className="px-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {results.appointments.map((a) => (
                <Command.Item
                  key={a.id}
                  value={`appointment ${a.patientName} ${a.therapistName}`}
                  onSelect={() => go(`/dashboard/calendar?from=${encodeURIComponent(a.startTime)}`)}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-accent"
                >
                  <span className="font-medium">{a.patientName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {a.serviceName} · {a.therapistName}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(a.startTime).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Go to" className="px-1 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            {allowedActions.map((a) => (
              <Command.Item
                key={a.href}
                value={`${a.label} ${a.hint}`}
                onSelect={() => go(a.href)}
                className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-accent"
              >
                <span>{a.label}</span>
                <span className="ml-2 text-[10px] uppercase text-muted-foreground">{a.hint}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
