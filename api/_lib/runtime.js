const cache = new Map();

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [entryKey, entryValue] of cache) {
      if (entryValue.timestamp < oldestTs) {
        oldestTs = entryValue.timestamp;
        oldestKey = entryKey;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

export function getRuntimeCacheConfig() {
  return {
    ttlMs: CACHE_TTL_MS,
    maxEntries: MAX_CACHE_ENTRIES,
  };
}
