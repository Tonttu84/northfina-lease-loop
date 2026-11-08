// A fixed window per client for the writes on /api (docs/features/security.md): at most `limit`
// requests in a window of `windowMs`, counted in this process. One instance holds the one SQLite
// file, so one memory is the whole truth. The clock is passed in with every call, so the rule is
// tested without waiting; the proxy passes Date.now().
export type RateLimit = {
  limit: number;
  windowMs: number;
  /** The map never holds more clients than this: the ended windows go first, then the oldest. */
  maxClients?: number;
};

/** Writes per client per minute: ten demo cards, a few payments and an exit fit many times over. */
export const API_WRITE_LIMIT: RateLimit = { limit: 120, windowMs: 60_000 };

export type RateLimitAnswer =
  { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** Counts one request of `key` at `now` (ms since the epoch) and says whether it may pass. */
  take(key: string, now: number): RateLimitAnswer;
  /** How many clients have a window open (for the tests). */
  size(): number;
};

export function createRateLimiter(rule: RateLimit): RateLimiter {
  const windows = new Map<string, { count: number; startedAt: number }>();
  const maxClients = rule.maxClients ?? 10_000;
  return {
    take(key, now) {
      // A scan from many addresses must not fill the memory: when the map is full, the ended
      // windows go, and if none has ended the oldest open one goes instead, so the map never
      // holds more than `maxClients` and a client rotating its address gains nothing.
      if (windows.size >= maxClients && !windows.has(key)) {
        let oldest: [string, number] | null = null;
        for (const [client, window] of windows) {
          if (now - window.startedAt >= rule.windowMs) windows.delete(client);
          else if (oldest === null || window.startedAt < oldest[1]) {
            oldest = [client, window.startedAt];
          }
        }
        if (windows.size >= maxClients && oldest) windows.delete(oldest[0]);
      }
      const current = windows.get(key);
      if (!current || now - current.startedAt >= rule.windowMs) {
        windows.set(key, { count: 1, startedAt: now });
        return { ok: true, remaining: rule.limit - 1 };
      }
      if (current.count >= rule.limit) {
        const endsAt = current.startedAt + rule.windowMs;
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now) / 1000)) };
      }
      current.count += 1;
      return { ok: true, remaining: rule.limit - current.count };
    },
    size: () => windows.size,
  };
}
