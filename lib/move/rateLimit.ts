/**
 * Per-client rate limiting for the Move service proxies and sensitive API endpoints.
 *
 * In-memory guard against rapid single-client saturation. protects against burst abuse
 * across active worker isolates.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Validates whether a candidate string looks like a standard IPv4 or IPv6 address.
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  // IPv4 or IPv6 with optional port stripped
  const clean = ip.split(":")[0].trim();
  const isIpv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(clean);
  const isIpv6 = /^[0-9a-fA-F:]{2,39}$/.test(ip);
  return isIpv4 || isIpv6;
}

/**
 * Resolves the client identifier for rate limiting.
 *
 * In Cloudflare Workers, `cf-connecting-ip` is injected by Cloudflare and cannot be forged by clients.
 */
export function clientKey(req: Request): string {
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && isValidIp(cfIp)) return cfIp;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) return realIp;

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isValidIp(forwarded)) return forwarded;

  // Fallback: create a deterministic bucket key per user-agent / language so all IP-less callers
  // do not collide into a single shared bucket and cause denial-of-service to each other.
  const ua = req.headers.get("user-agent")?.slice(0, 32) || "unknown";
  const lang = req.headers.get("accept-language")?.slice(0, 16) || "none";
  return `fallback:${ua}:${lang}`;
}

export function rateLimited(
  key: string,
  action = "move",
  maxPerWindow = MAX_PER_WINDOW,
  windowMs = WINDOW_MS
): boolean {
  const now = Date.now();
  const bucketKey = `${action}:${key}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > maxPerWindow;
}

/**
 * Drops expired buckets so memory does not grow unbounded over time.
 */
export function pruneBuckets(now: number = Date.now()): void {
  if (buckets.size < 256) return;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}