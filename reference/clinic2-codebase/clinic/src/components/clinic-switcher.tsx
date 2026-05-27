"use client";

/**
 * Header-mounted clinic switcher. Visible only to OWNER / ADMIN.
 *
 * Shows the currently active clinic as a pill; clicking opens a dropdown of
 * all active centres. Switching POSTs to /api/active-centre then reloads the
 * page so every server component picks up the new cookie.
 */

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Centre {
  id: string;
  name: string;
  slug: string;
  location: string;
  isActive: boolean;
}

export default function ClinicSwitcher() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role || "";
  const canSwitch = role === "OWNER" || role === "ADMIN" || role === "DEV";

  const [centres, setCentres] = useState<Centre[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canSwitch) return;
    Promise.all([
      fetch("/api/centres").then((r) => r.json()),
      fetch("/api/active-centre").then((r) => r.json()),
    ])
      .then(([centreList, active]) => {
        setCentres(Array.isArray(centreList) ? centreList.filter((c: Centre) => c.isActive) : []);
        setActiveId(active?.activeCentreId ?? null);
      })
      .catch(() => {});
  }, [canSwitch]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!canSwitch || centres.length === 0) return null;

  const active = centres.find((c) => c.id === activeId) || centres[0];

  const pick = async (id: string) => {
    if (id === activeId) { setOpen(false); return; }
    setSwitching(true);
    try {
      const res = await fetch("/api/active-centre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centreId: id }),
      });
      if (!res.ok) throw new Error("switch failed");
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-secondary border border-border-light hover:border-border text-xs font-semibold text-text-secondary hover:text-text-primary transition-all"
        aria-label="Switch clinic"
      >
        <Building2 className="h-3.5 w-3.5 text-indigo-600" />
        <span className="max-w-[140px] truncate">{active?.name ?? "No clinic"}</span>
        <span className="font-mono text-[10px] text-text-tertiary">{active?.slug}</span>
        {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[280px] bg-surface border border-border-light rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light bg-surface-secondary">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Active Clinic</p>
          </div>
          <div className="py-1 max-h-[320px] overflow-y-auto">
            {centres.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-surface-secondary transition-colors",
                  c.id === activeId && "bg-indigo-50/60"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{c.name}</p>
                  <p className="text-[11px] text-text-tertiary truncate">{c.location || c.slug}</p>
                </div>
                {c.id === activeId && <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
