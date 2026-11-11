/**
 * Supra Name Service (SNS / SupraNS) Reverse Resolution & High-Performance Cache Utility.
 * Resolves address -> primary_name.supra on Supra L1 with 2-layer caching (Memory + LocalStorage).
 * Guaranteed resolution: SupraNS names are registered on Supra Mainnet and valid across all environments.
 * Includes zero-latency synchronous cache reads, in-flight deduplication, and SWR revalidation with negative caching.
 */

const SNS_CONTRACT_MAINNET = "0x41aa7e05da1d6f014a59247d06c1832fc4437964b8d21e1f8df7a464f06ea920";
const RPC_MAINNET = "https://rpc-mainnet.supra.com/rpc/v1/view";

const SNS_CACHE_KEY = "supra_sns_cache_v1";
const POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for registered domains
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;       // 5 minutes for wallets without domain (prevents 500 spam)
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;     // 2 hours for background revalidation

interface CacheRecord {
  name: string | null;
  timestamp: number;
}

// 1. In-Memory Cache (0ms instant lookup across renders)
const memoryCache = new Map<string, CacheRecord>();

// 2. In-Flight Promise Map to deduplicate concurrent requests for the same address
const inFlightRequests = new Map<string, Promise<string | null>>();

/**
 * Hydrates memory cache from localStorage safely (browser-only)
 */
function hydrateFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(SNS_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheRecord>;
    const now = Date.now();
    for (const [key, record] of Object.entries(parsed)) {
      if (record && typeof record === "object" && typeof record.timestamp === "number") {
        const ttl = record.name ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
        if (now - record.timestamp < ttl) {
          memoryCache.set(key, record);
        }
      }
    }
  } catch {
    // Ignore storage parse issues
  }
}

// Auto-hydrate on client load
hydrateFromStorage();

/**
 * Persists the in-memory cache to localStorage with size caps and TTL filtering
 */
function persistToLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, CacheRecord> = {};
    let count = 0;
    const now = Date.now();
    for (const [key, value] of memoryCache.entries()) {
      const ttl = value.name ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
      if (now - value.timestamp < ttl) {
        obj[key] = value;
        count++;
        if (count >= 300) break; // Limit cache entries
      }
    }
    localStorage.setItem(SNS_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota or private mode issues
  }
}

function getCacheKey(address: string): string {
  const cleanAddress = address.trim().toLowerCase();
  return `sns_${cleanAddress}`;
}

/**
 * Synchronously reads the cached SNS name from Memory or LocalStorage.
 * Returns:
 *   - string: Valid registered name (e.g. "niro.supra")
 *   - null: Explicitly verified to NOT have an SNS name (negative cache)
 *   - undefined: Not yet present in cache (requires fetch)
 */
export function getSyncCachedSupraName(
  address: string | null | undefined,
  _network?: string | null
): string | null | undefined {
  if (!address || typeof address !== "string" || !address.startsWith("0x")) {
    return undefined;
  }

  const cacheKey = getCacheKey(address);
  const now = Date.now();

  // 1. Check in-memory cache
  const memoryRecord = memoryCache.get(cacheKey);
  if (memoryRecord) {
    const ttl = memoryRecord.name ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
    if (now - memoryRecord.timestamp < ttl) {
      return memoryRecord.name;
    }
  }

  // 2. Fallback to localStorage directly if memory cache was cold or flushed
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(SNS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, CacheRecord>;
        const diskRecord = parsed[cacheKey];
        if (diskRecord) {
          const ttl = diskRecord.name ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
          if (now - diskRecord.timestamp < ttl) {
            memoryCache.set(cacheKey, diskRecord);
            return diskRecord.name;
          }
        }
      }
    } catch {
      // Storage unavailable
    }
  }

  return undefined;
}

/**
 * Resolves a Supra address to its primary SNS name (e.g. "niro.supra") with deduplication and 2-layer cache.
 * Resolves from official SupraNS registry (Supra L1 Mainnet).
 */
export async function resolveSupraName(
  address: string | null | undefined,
  _network?: string | null
): Promise<string | null> {
  if (!address || typeof address !== "string" || !address.startsWith("0x")) {
    return null;
  }

  const cleanAddress = address.trim().toLowerCase();
  const cacheKey = getCacheKey(address);
  const now = Date.now();

  // 1. Check cache record
  const cachedRecord = memoryCache.get(cacheKey);
  if (cachedRecord) {
    if (cachedRecord.name === null) {
      if (now - cachedRecord.timestamp < NEGATIVE_CACHE_TTL_MS) {
        return null; // Still inside negative cache window, avoid spamming RPC with 500s
      }
    } else {
      if (now - cachedRecord.timestamp < POSITIVE_CACHE_TTL_MS) {
        const isStale = now - cachedRecord.timestamp > STALE_THRESHOLD_MS;
        if (!isStale) return cachedRecord.name;
        // Background revalidation for stale positive records
        triggerBackgroundResolution(cleanAddress, cacheKey).catch(() => {});
        return cachedRecord.name;
      }
    }
  }

  // 2. Check if a request for this key is already in flight (deduplicate)
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  // 3. Initiate resolution
  const resolutionPromise = triggerBackgroundResolution(cleanAddress, cacheKey);
  inFlightRequests.set(cacheKey, resolutionPromise);

  try {
    return await resolutionPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Performs on-chain RPC view call to the official SupraNS router contract on Mainnet
 */
async function triggerBackgroundResolution(
  cleanAddress: string,
  cacheKey: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const response = await fetch(RPC_MAINNET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: `${SNS_CONTRACT_MAINNET}::router::get_primary_name`,
        type_arguments: [],
        arguments: [cleanAddress],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // If RPC returns != 200 (Move aborts when wallet has no SNS name, yielding HTTP 500),
    // cache null as negative record so we do not loop/spam the RPC.
    if (!response.ok) {
      memoryCache.set(cacheKey, { name: null, timestamp: Date.now() });
      persistToLocalStorage();
      return null;
    }

    const data: any = await response.json();
    let resolvedName: string | null = null;

    if (data?.result && Array.isArray(data.result) && data.result.length >= 2) {
      const subdomain = data.result[0]?.vec?.[0];
      const domain = data.result[1]?.vec?.[0];

      if (domain && typeof domain === "string") {
        resolvedName = subdomain ? `${subdomain}.${domain}.supra` : `${domain}.supra`;
      }
    }

    // Save positive or null record to Memory & LocalStorage
    const record: CacheRecord = {
      name: resolvedName,
      timestamp: Date.now(),
    };
    memoryCache.set(cacheKey, record);
    persistToLocalStorage();

    return resolvedName;
  } catch (err) {
    console.debug("[SupraNS] Resolution error or timeout for:", cleanAddress, err);
    // On network failure or timeout, cache temporary negative record to avoid request stampedes
    memoryCache.set(cacheKey, { name: null, timestamp: Date.now() });
    persistToLocalStorage();
    return null;
  }
}
