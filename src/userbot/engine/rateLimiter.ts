/**
 * Simple per-userbot rate limiter.
 *
 * Limits how many commands a single userbot can execute within a time window.
 * Prevents abuse via rapid-fire .exec, .gcast, .stalk, etc.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const RATE_LIMIT_MAX = 30;            // max 30 commands per 10s per userbot

const rateLimitMap = new Map<number, RateLimitEntry>();

// Periodic cleanup: remove stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [uid, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(uid);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`🧹 RateLimit cleanup: removed ${cleaned} stale entries`);
}, 300_000).unref();

/**
 * Check if a userbot has exceeded its rate limit.
 * Returns true if the request is allowed, false if rate-limited.
 * Automatically increments the counter.
 */
export function checkRateLimit(telegramId: number): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(telegramId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(telegramId, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    return false; // rate limited
  }

  return true; // allowed
}

/**
 * Get remaining allowance for a userbot (for informational purposes).
 */
export function getRemainingRequests(telegramId: number): number {
  const now = Date.now();
  const entry = rateLimitMap.get(telegramId);
  if (!entry || now > entry.resetAt) return RATE_LIMIT_MAX;
  return Math.max(0, RATE_LIMIT_MAX - entry.count);
}
