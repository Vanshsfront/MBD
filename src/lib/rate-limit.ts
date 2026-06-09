// AUTH-010 / API-001: env-gated rate limiter.
//
// On a single-node deployment, an in-process Map is enough. On Vercel
// serverless, every cold start gets its own Map — so a credential-stuffer
// landing on N Lambda instances sees N × limit attempts before any 429.
// The live audit on 2026-06-09 confirmed this empirically: 15 wrong
// passwords against /api/auth/callback/credentials produced zero 429s.
//
// Resolution:
//   - Default: the existing in-process Map (zero dependencies, fine for
//     dev + single-node prod + Vercel local).
//   - When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are both
//     present at runtime, switch to a shared Upstash store. Same public
//     API. No code changes needed — just set the env vars.
//
// Migration path off Upstash (e.g. self-hosted Redis on a VPS later):
//   - Add a new implementation of RateLimitStore that talks to your Redis
//     via `redis` or `ioredis`. Drop the Upstash adapter or keep both.
//   - The interface is async + minimal so the surface is small.
//
// Reference: reference/rate-limiter-upstash.md for setup/runbook.

interface ConsumeResult {
  ok: boolean;
  retryAfter?: number;
  remaining: number;
  limit: number;
}

interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<ConsumeResult>;
}

// ─── In-process Map adapter ──────────────────────────────────────────
//
// Per-key sliding window. Pruned in-line on each call; background sweep
// every 60 s drops fully-expired keys so the Map stays bounded.

interface Bucket {
  hits: number[];
}

class MapStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  constructor() {
    this.startSweeper();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<ConsumeResult> {
    const now = Date.now();
    const cutoff = now - windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      this.buckets.set(key, bucket);
    }

    let pruneIdx = 0;
    while (pruneIdx < bucket.hits.length && bucket.hits[pruneIdx] < cutoff) {
      pruneIdx++;
    }
    if (pruneIdx > 0) bucket.hits.splice(0, pruneIdx);

    if (bucket.hits.length >= limit) {
      const oldest = bucket.hits[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return { ok: false, retryAfter, remaining: 0, limit };
    }

    bucket.hits.push(now);
    return { ok: true, remaining: Math.max(0, limit - bucket.hits.length), limit };
  }

  private startSweeper(): void {
    if (typeof setInterval !== "function") return;
    const handle = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 10 * 60 * 1000;
      for (const [key, bucket] of this.buckets) {
        if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
          this.buckets.delete(key);
        }
      }
    }, 60 * 1000);
    if (typeof handle === "object" && handle && "unref" in handle) {
      (handle as { unref: () => void }).unref();
    }
  }
}

// ─── Upstash REST adapter ────────────────────────────────────────────
//
// Uses Upstash's `/pipeline` endpoint to perform the four sorted-set
// commands atomically per request. No SDK dependency — just fetch.
//
// Algorithm: append-and-count. ZADD the new hit, ZREMRANGEBYSCORE prunes
// anything before the window, ZCARD reports the count. If count > limit,
// we're over — return retryAfter approximated from the window size.
// (Exact retryAfter would need an extra ZRANGE roundtrip; the approximation
// is close enough for client backoff hints.)

class UpstashStore implements RateLimitStore {
  constructor(private url: string, private token: string) {}

  async consume(key: string, limit: number, windowMs: number): Promise<ConsumeResult> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const member = `${now}-${Math.floor(Math.random() * 1e9)}`;
    const ttlSec = Math.max(1, Math.ceil(windowMs / 1000) * 2);
    const rlKey = `rl:${key}`;

    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["ZADD", rlKey, String(now), member],
          ["ZREMRANGEBYSCORE", rlKey, "0", String(cutoff - 1)],
          ["ZCARD", rlKey],
          ["EXPIRE", rlKey, String(ttlSec)],
        ]),
        // Fail closed on network: a slow Upstash should not stall the request.
        signal: AbortSignal.timeout(800),
      });

      if (!res.ok) {
        // Upstash unhealthy — allow the request through rather than failing closed.
        // Logged to console so ops can see store outages.
        console.warn("[rate-limit] Upstash REST returned", res.status);
        return { ok: true, remaining: limit - 1, limit };
      }

      const body = (await res.json()) as Array<{ result: number | string }>;
      const count = typeof body[2]?.result === "number" ? body[2].result : Number(body[2]?.result ?? 0);

      if (count > limit) {
        const retryAfter = Math.max(1, Math.ceil(windowMs / 1000));
        return { ok: false, retryAfter, remaining: 0, limit };
      }
      return { ok: true, remaining: Math.max(0, limit - count), limit };
    } catch (err) {
      // Network error / timeout / abort. Allow the request through; log so
      // it's visible in monitoring.
      console.warn("[rate-limit] Upstash fetch error", err);
      return { ok: true, remaining: limit - 1, limit };
    }
  }
}

// ─── Selector ─────────────────────────────────────────────────────────
//
// Built once per module load. The store decision is fixed for the life
// of the process — flipping the env vars requires a redeploy.

declare global {
  // eslint-disable-next-line no-var
  var __mbdRateLimitStore: RateLimitStore | undefined;
}

function getStore(): RateLimitStore {
  if (globalThis.__mbdRateLimitStore) return globalThis.__mbdRateLimitStore;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const store: RateLimitStore =
    url && token ? new UpstashStore(url, token) : new MapStore();

  globalThis.__mbdRateLimitStore = store;
  return store;
}

// ─── Public API ───────────────────────────────────────────────────────

export async function consume(
  key: string,
  limit: number,
  windowMs: number,
): Promise<ConsumeResult> {
  return getStore().consume(key, limit, windowMs);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function enforce(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{
  status: 429;
  headers: Record<string, string>;
  body: { error: string; retryAfter: number };
} | null> {
  const r = await consume(key, limit, windowMs);
  if (r.ok) return null;
  return {
    status: 429,
    headers: {
      "Retry-After": String(r.retryAfter ?? 60),
      "X-RateLimit-Limit": String(r.limit),
      "X-RateLimit-Remaining": "0",
      "Content-Type": "application/json",
    },
    body: { error: "rate_limited", retryAfter: r.retryAfter ?? 60 },
  };
}
