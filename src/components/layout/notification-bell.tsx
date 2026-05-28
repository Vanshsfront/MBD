"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NotificationView {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  priority: string;
  createdAt: string;
  metadata: string | null;
}

const POLL_MS = 60_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as {
        unreadCount: number;
        notifications: NotificationView[];
      };
      setUnreadCount(data.unreadCount);
      setItems(data.notifications);
      setLoaded(true);
    } catch {
      // network blip — silent
    }
  }, []);

  // Initial load + polling. The initial call is deferred via setTimeout(0)
  // so the setState inside fetchData() runs in a callback (React 19 lint
  // disallows synchronous setState in an effect body).
  useEffect(() => {
    const initial = setTimeout(() => void fetchData(), 0);
    const id = setInterval(() => void fetchData(), POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [fetchData]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markAllRead() {
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error(`mark-read failed (${res.status})`);
      setUnreadCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success("All marked read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function markRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(360px,90vw)] overflow-hidden rounded-md border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 ? (
              <Button size="sm" variant="ghost" onClick={markAllRead}>
                Mark all read
              </Button>
            ) : null}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing new.</p>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={n.isRead ? "" : "bg-muted/40"}
                  >
                    <button
                      type="button"
                      onClick={() => !n.isRead && void markRead(n.id)}
                      disabled={n.isRead}
                      aria-label={
                        n.isRead
                          ? `${n.title} (already read)`
                          : `Mark notification "${n.title}" as read`
                      }
                      className="block w-full cursor-pointer px-4 pt-3 pb-1 text-left transition-colors focus:outline-none focus-visible:bg-muted/70 hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{n.title}</p>
                          <p className="text-xs text-muted-foreground">{n.message}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {new Date(n.createdAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {!n.isRead ? <Badge variant="info" className="text-[10px]">new</Badge> : null}
                      </div>
                    </button>
                    <div className="px-4 pb-3">
                      <DeepLink type={n.type} metadata={n.metadata} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeepLink({ type, metadata }: { type: string; metadata: string | null }) {
  if (!metadata) return null;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (type === "NEW_PATIENT" || type === "APPT_REMINDER") {
    const cid = parsed.clientId;
    if (typeof cid === "string") {
      return (
        <Link
          href={`/dashboard/patients/${cid}`}
          className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          View patient →
        </Link>
      );
    }
  }
  if (type === "CHANGE_REQUEST") {
    return (
      <Link
        href="/dashboard/admin/change-requests"
        className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        View change request →
      </Link>
    );
  }
  return null;
}

function BellIcon() {
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
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}
