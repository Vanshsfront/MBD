"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Activity, FileText, Package, Calendar, X, ArrowRight } from "lucide-react";

interface SearchResult {
  type: "patient" | "session" | "invoice" | "package";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  patient: Users,
  session: Activity,
  invoice: FileText,
  package: Package,
};

const TYPE_COLORS: Record<string, string> = {
  patient: "bg-blue-50 text-blue-600",
  session: "bg-purple-50 text-purple-600",
  invoice: "bg-emerald-50 text-emerald-600",
  package: "bg-amber-50 text-amber-600",
};

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search across multiple entities
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const [clientsRes, sessionsRes, invoicesRes, packagesRes] = await Promise.allSettled([
        fetch("/api/clients").then(r => r.json()),
        fetch("/api/sessions").then(r => r.json()),
        fetch("/api/invoices").then(r => r.json()),
        fetch("/api/packages?status=ACTIVE").then(r => r.json()),
      ]);

      const found: SearchResult[] = [];
      const lq = q.toLowerCase();

      // Search clients
      if (clientsRes.status === "fulfilled") {
        const clients = clientsRes.value?.clients || clientsRes.value || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clients.forEach((c: any) => {
          const name = `${c.firstName} ${c.lastName}`.toLowerCase();
          const code = (c.clientCode || "").toLowerCase();
          const phone = (c.phone || "").toLowerCase();
          if (name.includes(lq) || code.includes(lq) || phone.includes(lq)) {
            found.push({
              type: "patient", id: c.id,
              title: `${c.firstName} ${c.lastName}`,
              subtitle: `${c.clientCode} · ${c.phone}`,
              href: `/dashboard/patients/${c.id}`,
            });
          }
        });
      }

      // Search sessions
      if (sessionsRes.status === "fulfilled") {
        const sessions = sessionsRes.value || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sessions.slice(0, 50).forEach((s: any) => {
          const clientName = `${s.client?.firstName || ""} ${s.client?.lastName || ""}`.toLowerCase();
          const therapistName = (s.therapist?.name || "").toLowerCase();
          if (clientName.includes(lq) || therapistName.includes(lq)) {
            found.push({
              type: "session", id: s.id,
              title: `${s.client?.firstName} ${s.client?.lastName} — ${s.service?.name}`,
              subtitle: `${s.therapist?.name} · ${s.status}`,
              href: "/dashboard/sessions",
            });
          }
        });
      }

      // Search invoices
      if (invoicesRes.status === "fulfilled") {
        const invoices = invoicesRes.value || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        invoices.slice(0, 30).forEach((i: any) => {
          const num = (i.invoiceNumber || "").toLowerCase();
          const clientName = `${i.client?.firstName || ""} ${i.client?.lastName || ""}`.toLowerCase();
          if (num.includes(lq) || clientName.includes(lq)) {
            found.push({
              type: "invoice", id: i.id,
              title: `${i.invoiceNumber} — ₹${i.totalAmount?.toLocaleString()}`,
              subtitle: `${i.client?.firstName} ${i.client?.lastName} · ${i.status}`,
              href: "/dashboard/billing/invoices",
            });
          }
        });
      }

      setResults(found.slice(0, 12));
      setSelectedIndex(0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface rounded-xl shadow-2xl border border-border-light overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light">
          <Search className="h-5 w-5 text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search patients, invoices, sessions..."
            className="flex-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary bg-transparent"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-secondary border border-border-light text-[10px] font-semibold text-text-tertiary">
            ESC
          </kbd>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-surface-secondary sm:hidden">
            <X className="h-4 w-4 text-text-tertiary" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.length < 2 ? (
            <div className="py-10 text-center">
              <Search className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-sm text-text-tertiary">Type at least 2 characters to search</p>
              <p className="text-[10px] text-text-tertiary mt-1">
                Search patients, sessions, invoices across the system
              </p>
            </div>
          ) : loading ? (
            <div className="py-10 text-center">
              <div className="h-5 w-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-text-tertiary">Searching...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-text-tertiary">No results for &quot;{query}&quot;</p>
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, i) => {
                const Icon = TYPE_ICONS[r.type] || Users;
                const color = TYPE_COLORS[r.type] || "bg-surface-secondary text-text-secondary";
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selectedIndex ? "bg-blue-50" : "hover:bg-surface-secondary"
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{r.title}</p>
                      <p className="text-[11px] text-text-tertiary truncate">{r.subtitle}</p>
                    </div>
                    {i === selectedIndex && (
                      <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-light bg-surface-secondary flex items-center justify-between text-[10px] text-text-tertiary">
          <span>↑↓ Navigate · ↵ Select · Esc Close</span>
          <span className="font-semibold">⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
