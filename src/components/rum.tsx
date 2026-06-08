"use client";

// Real-user Core Web Vitals client.
//
// Hooks the web-vitals library (Google, Apache-2.0) at mount and ships
// each LCP/CLS/INP/FCP/TTFB sample to /api/rum. Survives navigation; the
// library is idempotent per metric per page.
//
// Reference: audit-2026-06-06 BUNDLE-005, F-009.

import { useEffect } from "react";

const SESSION_STORAGE_KEY = "mbd-rum-session";

function rumSessionId(): string {
  if (typeof sessionStorage === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

function ship(payload: {
  metric: string;
  value: number;
  rating?: string;
  page: string;
  navigationType?: string;
  sessionId?: string;
}): void {
  // Prefer sendBeacon — survives page unload at end-of-navigation.
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/rum", blob);
      return;
    } catch {
      /* fall through to fetch */
    }
  }
  void fetch("/api/rum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* swallow — RUM must never crash the page */
  });
}

export function Rum(): null {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { onLCP, onCLS, onINP, onFCP, onTTFB } = await import("web-vitals");
        if (cancelled) return;
        const session = rumSessionId();
        const path = window.location.pathname;
        const handler = (m: { name: string; value: number; rating?: string; navigationType?: string }) => {
          ship({
            metric: m.name,
            value: m.value,
            rating: m.rating,
            page: path,
            navigationType: m.navigationType,
            sessionId: session,
          });
        };
        onLCP(handler);
        onCLS(handler);
        onINP(handler);
        onFCP(handler);
        onTTFB(handler);
      } catch {
        /* swallow — RUM must never crash the app */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
