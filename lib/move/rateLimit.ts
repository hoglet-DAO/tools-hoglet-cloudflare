/**
 * Per-client rate limiting for the Move service proxies.
 *
 * Shared by `/api/move/compile` and `/api/move/test` rather than duplicated: both sit in front of the same
 * serialised VPS, so a limit that applied to one and not the other would be trivially bypassed by using the
 * other.
 *
 * In-memory, which is the honest scope for this: it protects a single server process, and the deployment
 * target may run several. It is a guard against one caller saturating the compiler, not a billing control.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * The real client behind the proxy.
 *
 * Cloudflare sets these; the first one present is the client rather than the edge, so a request forwarded
 * through the CDN is not attributed to the CDN's address for everyone.
 */
export function clientKey(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

/**
 * Drops expired buckets so a long-running process does not accumulate one entry per distinct IP.
 *
 * Called from the request path rather than on a timer, so it costs nothing while the map is small.
 */
export function pruneBuckets(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}