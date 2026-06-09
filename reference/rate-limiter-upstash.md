# Rate limiter — Upstash adapter + future VPS migration

**Status:** Built. Dormant until env vars are set.

The repo ships with an env-gated rate limiter (`src/lib/rate-limit.ts`).
Without env vars it uses the existing in-process `Map` — same broken-on-
Vercel-serverless behaviour as before (each Lambda gets its own counter,
credential-stuffing isn't actually throttled). To turn on real rate
limiting, set two env vars in the Vercel project and redeploy. No code
changes.

This was built dormant so it ships safely now and can be activated when
Upstash is provisioned (or replaced with a VPS Redis later).

## Activate Upstash (current, free)

1. **Provision Upstash** at <https://console.upstash.com>. Free tier:
   10,000 commands/day, 256 MB, global region selection. No card.
   Pick a region close to the Vercel deploy (e.g. `ap-south-1` for
   the India clinic).

2. **Copy** the *REST URL* and *REST Token* from the database details
   page (NOT the redis:// connection string — we use the REST endpoint
   so we don't need a long-lived TCP connection from a Lambda).

3. **Set in Vercel** → Project → Settings → Environment Variables:

   ```
   UPSTASH_REDIS_REST_URL   = https://<your-db>.upstash.io
   UPSTASH_REDIS_REST_TOKEN = <token from step 2>
   ```

   Apply to: Production, Preview, Development (matches your auth
   thresholds across environments).

4. **Redeploy.** On first request, `getStore()` detects both env vars
   and constructs an `UpstashStore` instead of the `MapStore`. The
   switch is global per process and survives hot reloads.

5. **Verify.** Trigger 6 wrong-password attempts to
   `POST /api/auth/callback/credentials` from a single IP. The 6th
   should return 429. (The auth limiter is 5/min per email + 30/min
   per IP.)

## Stop using Upstash (revert to in-process)

Unset the two env vars and redeploy. The store reverts to `MapStore`.
No code path is removed — flip back any time.

## Migrate to self-hosted Redis on a VPS later

The code is structured so this is a single-file addition. The
`RateLimitStore` interface (in `src/lib/rate-limit.ts`) has one method:

```ts
interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<ConsumeResult>;
}
```

To swap to Redis on a VPS:

1. Add a Redis driver: `npm install ioredis` (or `redis`).

2. Add a `RedisStore` class in `src/lib/rate-limit.ts`:

   ```ts
   import Redis from "ioredis";

   class RedisStore implements RateLimitStore {
     private client: Redis;
     constructor(url: string) {
       this.client = new Redis(url);
     }
     async consume(key, limit, windowMs) {
       const now = Date.now();
       const cutoff = now - windowMs;
       const member = `${now}-${Math.random()}`;
       const ttlSec = Math.ceil(windowMs / 1000) * 2;
       const rlKey = `rl:${key}`;

       const tx = this.client.multi();
       tx.zadd(rlKey, now, member);
       tx.zremrangebyscore(rlKey, 0, cutoff - 1);
       tx.zcard(rlKey);
       tx.expire(rlKey, ttlSec);
       const res = await tx.exec();
       const count = Number(res?.[2]?.[1] ?? 0);

       if (count > limit) {
         return { ok: false, retryAfter: Math.ceil(windowMs / 1000), remaining: 0, limit };
       }
       return { ok: true, remaining: Math.max(0, limit - count), limit };
     }
   }
   ```

3. Update `getStore()` to pick `RedisStore` when a `REDIS_URL` env var
   is set, falling back to Upstash, then Map:

   ```ts
   const redisUrl = process.env.REDIS_URL;
   const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
   const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

   const store: RateLimitStore =
     redisUrl ? new RedisStore(redisUrl) :
     upstashUrl && upstashToken ? new UpstashStore(upstashUrl, upstashToken) :
     new MapStore();
   ```

4. Set `REDIS_URL` (`redis://user:pass@your-vps:6379/0`) in Vercel
   and redeploy. If/when Vercel ever moves to a different host, the
   same Redis can keep serving.

## Failure mode

Both Upstash and Redis stores **fail open** on network errors / timeouts —
they log a warning and allow the request through. Rationale: a stalled
rate-limit store should never stall PHI access. Monitor the warnings;
if they spike, the store is unhealthy and rate limiting is effectively
disabled.

## Cost ceiling

| Tier | Cost | Capacity | Notes |
|---|---|---|---|
| Upstash free | $0 | 10k cmd/day | Fine for low-traffic clinic, ~3 cmd per gated request → ~3.3k req/day budget |
| Upstash Pay-as-you-go | $0.20 / 100k cmd | unlimited | Activates if you exceed free |
| Self-hosted on existing VPS | $0 marginal | unlimited | Best if you already have a VPS |

The Map fallback costs nothing — it's the current state — but doesn't
actually throttle across Lambda instances. **For PHI compliance treat the
Map fallback as "rate limiting is OFF" and don't claim it as a control.**

## Related findings (resolved when Upstash is activated)

- AUTH-010 — credential stuffing throttle (live audit 2026-06-09: 0× 429
  on 15 wrong passwords)
- API-001 — sensitive mutations unprotected by working limiter
- INFRA-004 — no application-layer DDoS / abuse limit at edge (partial —
  still want WAF at network edge)
