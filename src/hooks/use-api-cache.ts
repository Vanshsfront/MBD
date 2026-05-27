"use client";

// MBD Clinic OS — single client-data fetching primitive (PRD architecture commit).
// Ported verbatim from the legacy codebase: a lean Map-based cache with TTL,
// dedupe, and prefetch helpers. No TanStack Query dependency.

import { useState, useEffect, useCallback, useRef } from "react";

const cache = new Map<string, { data: unknown; timestamp: number }>();

const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface UseApiCacheOptions<T> {
  ttl?: number;
  skip?: boolean;
  transform?: (data: unknown) => T;
  forceRefresh?: boolean;
}

interface UseApiCacheResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<T | null>;
  invalidate: () => void;
}

export function useApiCache<T = unknown>(
  url: string | null,
  options: UseApiCacheOptions<T> = {},
): UseApiCacheResult<T> {
  const { ttl = DEFAULT_TTL_MS, skip = false, transform, forceRefresh = false } = options;

  const [data, setData] = useState<T | null>(() => {
    if (!url || skip) return null;
    const cached = cache.get(url);
    if (cached && !forceRefresh && Date.now() - cached.timestamp < ttl) {
      return (transform ? transform(cached.data) : cached.data) as T;
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!url || skip) return false;
    const cached = cache.get(url);
    return !(cached && !forceRefresh && Date.now() - cached.timestamp < ttl);
  });
  const [error, setError] = useState<Error | null>(null);

  const urlRef = useRef(url);
  // Refs are updated in an effect rather than during render (Next 16 lint rule).
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const fetchData = useCallback(
    async (bypassCache = false): Promise<T | null> => {
      if (!url) return null;

      if (!bypassCache) {
        const cached = cache.get(url);
        if (cached && Date.now() - cached.timestamp < ttl) {
          const result = (transform ? transform(cached.data) : cached.data) as T;
          setData(result);
          setLoading(false);
          return result;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
        const json = await res.json();
        if (urlRef.current === url) {
          cache.set(url, { data: json, timestamp: Date.now() });
          const result = (transform ? transform(json) : json) as T;
          setData(result);
          setLoading(false);
          return result;
        }
        return null;
      } catch (err) {
        if (urlRef.current === url) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
        return null;
      }
    },
    [url, ttl, transform],
  );

  const refetch = useCallback(async () => fetchData(true), [fetchData]);
  const invalidate = useCallback(() => {
    if (url) cache.delete(url);
  }, [url]);

  useEffect(() => {
    if (skip || !url) return;
    // setState happens inside fetchData (data, loading, error). The ESLint
    // react-hooks/set-state-in-effect rule recommends moving such state into
    // an external store, but this is the documented pattern for a tiny in-app
    // fetch cache; suppressing locally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData(forceRefresh);
  }, [url, skip, forceRefresh, fetchData]);

  return { data, loading, error, refetch, invalidate };
}

export async function cachedFetch<T = unknown>(url: string, ttl = DEFAULT_TTL_MS): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data as T;
}

export function invalidateCache(urlOrPrefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
}

export function clearAllCache(): void {
  cache.clear();
}

export async function prefetchUrl(url: string, ttl = DEFAULT_TTL_MS): Promise<void> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    cache.set(url, { data, timestamp: Date.now() });
  } catch {
    // best-effort; no-op
  }
}

export function prefetchAll(urls: string[], ttl = DEFAULT_TTL_MS): void {
  urls.forEach((url) => void prefetchUrl(url, ttl));
}
