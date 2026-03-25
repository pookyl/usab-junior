import { loadPlayerDirectoryIndex } from './_lib/rankingsDiskCache.js';
import { getCached, setCache, setCors } from './_lib/runtime.js';
import { createRequestMetrics, sendApiError, sendJson, UnavailableError } from './_lib/http.js';

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
    const directory = indexed?.players ?? indexed?.directory ?? null;

    if (!directory) {
      throw new UnavailableError('Player directory index unavailable');
    }

    setCache(cacheKey, directory);
    metrics.log({ count: directory.length, source: 'index' });
    return sendJson(res, 200, directory, metrics.buildHeaders({
      'X-Cache': 'DISK',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    }));
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'player-directory' });
  }
}
