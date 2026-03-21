import {
  getCached, setCache,
  listCachedDates, loadDiskCacheForDate,
  setCors,
} from './_lib/shared.js';
import { sendApiError, sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cacheKey = 'player-directory';

  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached, { 'X-Cache': 'HIT' });

  try {
    const dates = (await listCachedDates()).sort();
    const playerMap = new Map();

    for (const date of dates) {
      const disk = await loadDiskCacheForDate(date);
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

    const directory = [...playerMap.values()]
      .map((entry) => {
        const names = [entry.latestName, ...[...entry.nameSet].filter((n) => n !== entry.latestName)];
        return { usabId: entry.usabId, name: entry.latestName, names };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    setCache(cacheKey, directory);
    return sendJson(res, 200, directory, { 'X-Cache': 'MISS' });
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'player-directory' });
  }
}
