import {
  listCachedDates,
  loadDiskCacheForDate,
  loadPlayerDirectoryIndex,
} from './_lib/rankingsDiskCache.js';
import { getCached, setCache, setCors } from './_lib/runtime.js';
import { createRequestMetrics, sendApiError, sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cacheKey = 'player-directory';

  const cached = getCached(cacheKey);
  if (cached) {
    return sendJson(res, 200, cached, {
      'X-Cache': 'HIT',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    });
  }

  try {
    const metrics = createRequestMetrics('player-directory');
    const indexed = await metrics.time('load_index', () => loadPlayerDirectoryIndex());
    let directory = indexed?.directory ?? null;

    if (!directory) {
      const dates = (await metrics.time('list_dates', () => listCachedDates())).sort();
      const playerMap = new Map();

      for (const date of dates) {
        const disk = await metrics.time(`load_${date}`, () => loadDiskCacheForDate(date));
        if (!disk || !disk.allPlayers) continue;

        for (const p of disk.allPlayers) {
          const existing = playerMap.get(p.usabId);
          if (existing) {
            existing.latestName = p.name;
            if (!existing.nameSet.has(p.name)) {
              existing.nameSet.add(p.name);
            }
          } else {
            playerMap.set(p.usabId, {
              usabId: p.usabId,
              latestName: p.name,
              nameSet: new Set([p.name]),
            });
          }
        }
      }

      directory = [...playerMap.values()]
        .map((entry) => {
          const names = [entry.latestName, ...[...entry.nameSet].filter((n) => n !== entry.latestName)];
          return { usabId: entry.usabId, name: entry.latestName, names };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    setCache(cacheKey, directory);
    metrics.log({ count: directory.length, source: indexed?.directory ? 'index' : 'scan' });
    return sendJson(res, 200, directory, metrics.buildHeaders({
      'X-Cache': 'MISS',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    }));
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'player-directory' });
  }
}
