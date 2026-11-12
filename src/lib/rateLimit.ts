/**
 * A small fixed-window rate limit kept in process memory. Good enough to stop a runaway
 * client or a pasted loop from burning the token budget in seconds; it is per serverless
 * instance, so it bounds rather than guarantees — the daily token caps (judge mode) are the
 * hard ceiling behind it.
 */

export type RateLimit = {
  /** True if the call is allowed; `retryAfterSeconds` says how long to wait otherwise. */
  take(key: string, now?: number): { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };
};

export function fixedWindowLimit(limit: number, windowMs: number): RateLimit {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        // Keep the map from growing without bound across a long-lived instance.
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
        }
        return { ok: true, remaining: limit - 1 };
      }
      if (current.count >= limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.start + windowMs - now) / 1000)) };
      }
      current.count += 1;
      return { ok: true, remaining: limit - current.count };
    },
  };
}

/** Agent turns per session per minute. */
export const AGENT_TURNS_PER_MINUTE = 10;

export const agentLimit = fixedWindowLimit(AGENT_TURNS_PER_MINUTE, 60_000);
