/**
 * In-memory signed-URL cache for record photos.
 *
 * The `record-photos` bucket is private, so every photo render needs a
 * signed URL from `supabase.storage.from(...).createSignedUrl(path, ttl)`.
 * Without a cache, scrolling a list view would re-sign every visible photo
 * on every render — wasteful, and would hammer the storage API.
 *
 * Scope: lifetime of the SPA tab. Cleared on full reload. No `localStorage`
 * or `sessionStorage` persistence — signed URLs contain credentials in the
 * query string, and persisting them across reloads risks leaking them via
 * dev-tools storage panels or future export features.
 *
 * Invalidation: entries are dropped when their expiry is within
 * `EXPIRY_SAFETY_MARGIN_S` of `now`. Tighter than the actual storage TTL so
 * a URL handed to an `<img>` element won't 403 mid-render.
 *
 * Concurrency: not deduplicated. Two near-simultaneous `getPhotoUrl(path)`
 * calls for the same cold path will both fetch — acceptable, since the
 * second write just overwrites the first with an equivalent URL. If this
 * becomes a hotspot, swap the map value for a `Promise<CacheEntry>` to
 * coalesce in-flight signs.
 */

const EXPIRY_SAFETY_MARGIN_S = 60;

type CacheEntry = {
  url: string;
  /** Absolute Unix-seconds timestamp at which this URL stops being valid. */
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

/** Returns the cached URL for `path` if it's still valid, else `null`. */
export function readCache(path: string, now: number = nowSeconds()): string | null {
  const entry = cache.get(path);
  if (!entry) return null;
  if (entry.expiresAt - EXPIRY_SAFETY_MARGIN_S <= now) {
    cache.delete(path);
    return null;
  }
  return entry.url;
}

/** Store `url` for `path`, computing absolute expiry from the TTL. */
export function writeCache(
  path: string,
  url: string,
  ttlSeconds: number,
  now: number = nowSeconds(),
): void {
  cache.set(path, { url, expiresAt: now + ttlSeconds });
}

/**
 * Drop `path` from the cache. Call after `deletePhoto` to avoid serving a
 * stale URL that points at a now-deleted object.
 */
export function invalidate(path: string): void {
  cache.delete(path);
}

/**
 * Reset the cache. Test seam — production code never calls this; users sign
 * out by reloading, which throws the entire SPA state away anyway.
 */
export function clearCache(): void {
  cache.clear();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
