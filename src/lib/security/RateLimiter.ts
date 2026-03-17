/**
 * Sliding-window rate limiter: max 5 scans per minute per IP.
 * Throws RateLimitExceededError when limit exceeded.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds = 60;

  constructor(ip: string, count: number) {
    super(
      `Rate limit exceeded: ${count} requests in the last minute for ${ip}. Try again in 60 seconds.`,
    );
    this.name = "RateLimitExceededError";
  }
}

const store = new Map<string, number[]>();

function prune(ip: string): void {
  const timestamps = store.get(ip);
  if (!timestamps?.length) return;

  const cutoff = Date.now() - WINDOW_MS;
  const kept = timestamps.filter((timestamp) => timestamp > cutoff);
  if (kept.length) store.set(ip, kept);
  else store.delete(ip);
}

/**
 * Check rate limit for the given IP before processing a scan.
 */
export function checkRateLimit(ip: string): void {
  prune(ip);
  const timestamps = store.get(ip) ?? [];
  if (timestamps.length >= MAX_REQUESTS) {
    throw new RateLimitExceededError(ip, timestamps.length);
  }

  timestamps.push(Date.now());
  store.set(ip, timestamps);
}
