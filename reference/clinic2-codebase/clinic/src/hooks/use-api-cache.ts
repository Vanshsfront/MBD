"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// In-memory cache store shared across all hook instances
const cache = new Map<string, { data: unknown; timestamp: number }>();

// Default TTL: 5 minutes
const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface UseApiCacheOptions<T> {
  /** Time-to-live in milliseconds. Defaults to 5 minutes. */
  ttl?: number;
  /** If true, skip the initial fetch (useful when you need to set params first). */
  skip?: boolean;
  /** Transform the raw JSON response before caching. */
  transform?: (data: unknown) => T;
  /** If true, always fetch fresh data (bypass cache). Useful after mutations. */
  forceRefresh?: boolean;
}

interface UseApiCacheResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Manually refetch and update the cache for this URL. */
  refetch: () => Promise<T | null>;
  /** Invalidate the cache entry for this URL without refetching. */
  invalidate: () => void;
}

/**
 * A hook that fetches data from an API endpoint with in-memory caching.
 * Cached responses are returned instantly, avoiding DB round-trips on every page navigation.
 *
 * @param url - The API endpoint to fetch from.
 * @param options - Configuration for caching behavior.
 */
export function useApiCache<T = unknown>(
  url: string | null,
  options: UseApiCacheOptions<T> = {}
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

  // Track the current URL to avoid stale setState calls
  const urlRef = useRef(url);
  urlRef.current = url;

  const fetchData = useCallback(
    async (bypassCache = false): Promise<T | null> => {
      if (!url) return null;

      // Check cache first
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

        // Only update state if the URL hasn't changed
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
    [url, ttl, transform]
  );

  const refetch = useCallback(async () => {
    return fetchData(true);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    if (url) {
      cache.delete(url);
    }
  }, [url]);

  useEffect(() => {
    if (skip || !url) return;
    fetchData(forceRefresh);
  }, [url, skip, forceRefresh, fetchData]);

  return { data, loading, error, refetch, invalidate };
}

/**
 * Fetch data with caching outside of a React component.
 * Useful for one-off fetches in event handlers after mutations.
 */
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

/**
 * Invalidate specific cache entries. Supports exact URL or a prefix match.
 * Call this after mutations (POST/PUT/DELETE) to ensure fresh data on next load.
 *
 * @param urlOrPrefix - Exact URL or URL prefix to invalidate.
 */
export function invalidateCache(urlOrPrefix: string): void {
  for (const key of cache.keys()) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache. Useful for logout scenarios.
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * Pre-warm the cache for a single URL in the background.
 * Does nothing (and won't throw) if the URL is already cached and valid.
 */
export async function prefetchUrl(url: string, ttl = DEFAULT_TTL_MS): Promise<void> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) return; // already warm
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    cache.set(url, { data, timestamp: Date.now() });
  } catch {
    // silently ignore — this is a best-effort background fetch
  }
}

/**
 * Pre-warm the cache for a list of URLs simultaneously.
 * Call this at layout mount so all page data is ready before the user navigates.
 */
export function prefetchAll(urls: string[], ttl = DEFAULT_TTL_MS): void {
  urls.forEach((url) => prefetchUrl(url, ttl));
}
