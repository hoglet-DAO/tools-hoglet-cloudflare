/**
 * Unified IPFS & R2 Token Image Resolution Utility.
 * 2-Layer Cache (Memory + LocalStorage) with instant 0ms lookup.
 * Eliminates CORS blocking, IPFS gateway 429s, and slow server re-encoding.
 */

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://pub-051414983f2e4fb6bc4b908ff3bcb03c.r2.dev';
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const IPFS_IO_GATEWAY = 'https://ipfs.io/ipfs/';

const CACHE_STORAGE_KEY = 'hoglet_token_img_cache_v3';

// Layer 1: In-Memory cache for 0ms synchronous lookups across renders
const memoryCache = new Map<string, string>();

// Layer 2: Hydrate memory cache from localStorage on client side
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([k, v]) => {
          if (typeof v === 'string') memoryCache.set(k, v);
        });
      }
    }
  } catch (e) {
    // Ignore localStorage parse errors
  }
}

/**
 * Extracts IPFS CIDv0 or CIDv1 from any known format or gateway URI
 */
export const extractCid = (uri: string | undefined | null): string | null => {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();

  if (trimmed.startsWith('ipfs://')) {
    const withoutPrefix = trimmed.substring(7);
    return withoutPrefix.split('/')[0] || withoutPrefix;
  }
  if (trimmed.includes('.ipfs.w3s.link')) {
    const match = trimmed.match(/https:\/\/([^.]+)\.ipfs\.w3s\.link/);
    if (match && match[1]) return match[1];
  }
  if (trimmed.includes('.ipfs.nftstorage.link')) {
    const match = trimmed.match(/https:\/\/([^.]+)\.ipfs\.nftstorage\.link/);
    if (match && match[1]) return match[1];
  }
  if (trimmed.includes('/ipfs/')) {
    const parts = trimmed.split('/ipfs/');
    if (parts.length > 1) {
      const cidMatch = parts[1].match(/^[a-zA-Z0-9]{46,59}/);
      if (cidMatch) return cidMatch[0];
    }
  }
  if (trimmed.match(/^[a-zA-Z0-9]{46,59}$/)) {
    return trimmed;
  }
  return null;
};

/**
 * Synchronous 0ms cache retrieval
 */
export const getCachedImageUri = (uri: string | undefined | null): string | null => {
  if (!uri) return null;
  const cached = memoryCache.get(uri);
  if (!cached) return null;
  
  // Validation: verify CID integrity if URI contains one
  const cid = extractCid(uri);
  if (cid && !cached.includes(cid)) {
    memoryCache.delete(uri);
    return null;
  }
  return cached;
};

/**
 * Saves a working image URL to both in-memory and persistent localStorage cache
 */
export const setCachedImageUri = (uri: string | undefined | null, resolvedUrl: string): void => {
  if (!uri || !resolvedUrl || resolvedUrl === '/default-token-icon.png' || resolvedUrl === '/no_image.webp') return;
  memoryCache.set(uri, resolvedUrl);
  if (typeof window !== 'undefined') {
    try {
      const obj: Record<string, string> = {};
      let count = 0;
      for (const [k, v] of memoryCache.entries()) {
        obj[k] = v;
        count++;
        if (count >= 300) break; // Limit cache entries
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      // Storage quota or private browsing mode
    }
  }
};

/**
 * Ultra-fast primary resolution for token icons:
 * 1. Checks 0ms cache first.
 * 2. If direct HTTP/HTTPS/data/local, returns as-is.
 * 3. If IPFS CID, resolves to Cloudflare R2 global CDN (<30ms).
 */
export const resolveFastTokenImage = (uri: string | undefined | null): string => {
  if (!uri) return '/default-token-icon.png';

  const cached = getCachedImageUri(uri);
  if (cached) return cached;

  if (uri.startsWith('https://') || uri.startsWith('http://') || uri.startsWith('data:image') || uri.startsWith('/')) {
    // If it's not a problematic gateway, return directly
    if (!uri.includes('.ipfs.w3s.link') && !uri.includes('.ipfs.nftstorage.link') && !uri.includes('ipfs.hoglet.xyz')) {
      return uri;
    }
  }

  const cid = extractCid(uri);
  if (cid) {
    const r2Url = `${R2_PUBLIC_URL}/${cid}`;
    setCachedImageUri(uri, r2Url);
    return r2Url;
  }

  return '/default-token-icon.png';
};

/**
 * Resolves directly to Cloudflare R2 CDN
 */
export const resolveR2Uri = (uri: string | undefined | null): string => {
  return resolveFastTokenImage(uri);
};

/**
 * Fallback gateway if primary R2 CDN encounters an un-mirrored file
 */
export const resolveFallbackGatewayUri = (uri: string | undefined | null): string => {
  if (!uri) return '/default-token-icon.png';
  const cid = extractCid(uri);
  if (cid) {
    return `${PINATA_GATEWAY}${cid}`;
  }
  return '/default-token-icon.png';
};

/**
 * Standard resolveIpfsUri backwards compatibility
 */
export const resolveIpfsUri = (uri: string | undefined | null): string => {
  return resolveFastTokenImage(uri);
};
