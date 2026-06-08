// In-process sliding-window rate limiter.
//
// Why home-grown rather than Upstash/Vercel KV/Redis:
//   - MBD is a single-node clinic deployment. There is no distributed
//     coordination problem to solve.
//   - Adds zero infrastructure, zero external dependencies, ~80 LOC.
//   - MIT-license-equivalent (in-repo) — fully open-source.
//
// Behaviour:
//   - Per-key sliding window: each call records the timestamp; on each
//     subsequent call, expired timestamps are pruned and the remaining
//     count is compared to the limit.
//   - Background sweep every 60 s drops keys whose entries are all
//     expired so the Map stays bounded even under random IP traffic.
//
// Limits:
//   - The counter is process-local. A server restart resets all windows.
//     Acceptable for a single-server clinic. If multi-process deployment
//     ever happens, swap the Map for a Redis-backed implementation
//     behind the same `consume()` interface.
//
// Reference: audit-2026-06-06.md F-005, AUTH-010, API-001 (High, live-confirmed).

interface Bucket {
  /** ms-since-epoch timestamps of each hit, kept sorted ascending */
  hits: number[];
}

interface ConsumeResult {
  ok: boolean;
  /** seconds the caller should wait before retrying (only set when !ok) */
  retryAfter?: number;
  /** remaining quota in the current window (>=0) */
  remaining: number;
  /** the window's `limit` value, for X-RateLimit-Limit */
  limit: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Record a hit against `key` and return whether it falls within
 * `limit` events per `windowMs`.
 */
export function consume(key: string, limit: number, windowMs: number): ConsumeResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Prune expired hits from the start of the array. Hits are appended in
  // chronological order, so a linear scan from index 0 finds the cutoff.
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

/**
 * Background sweep — drops fully-expired buckets so the Map can't grow
 * unboundedly under random-IP traffic. Started lazily on first import.
 */
function startSweeper(): void {
  // Skip in test environments where unref() is unsupported or undesired.
  if (typeof setInterval !== "function") return;
  const handle = setInterval(() => {
    const now = Date.now();
    // Use a generous expiry (10 min) — any window longer than this isn't
    // a sensible rate-limit anyway.
    const cutoff = now - 10 * 60 * 1000;
    for (const [key, bucket] of buckets) {
      if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
        buckets.delete(key);
      }
    }
  }, 60 * 1000);
  // Allow the process to exit even if this is the last handle.
  if (typeof handle === "object" && handle && "unref" in handle) {
    (handle as { unref: () => void }).unref();
  }
}

// Single global guard — survives Next.js hot reloads which would otherwise
// re-import the module and stack sweepers.
declare global {
  var __mbdRateLimitSweeperStarted: boolean | undefined;
}
if (!globalThis.__mbdRateLimitSweeperStarted) {
  startSweeper();
  globalThis.__mbdRateLimitSweeperStarted = true;
}

/**
 * Pull the caller's IP from standard headers. Falls back to a constant
 * sentinel so a missing header doesn't accidentally create a per-call key.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // First entry is the originating client; everything else is intermediaries.
    return xff.split(",")[0].trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Apply a single rate-limit rule and return a 429 response if exceeded.
 * Returns null when the call is allowed so the caller can keep going.
 */
export function enforce(
  key: string,
  limit: number,
  windowMs: number,
): { status: 429; headers: Record<string, string>; body: { error: string; retryAfter: number } } | null {
  const r = consume(key, limit, windowMs);
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
