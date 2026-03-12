import {
  getCached, setCache,
  listCachedDates, loadDiskCacheForDate,
  setCors,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cacheKey = 'player-directory';

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

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
    return res.setHeader('X-Cache', 'MISS').status(200).json(directory);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
