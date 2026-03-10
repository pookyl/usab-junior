import {
  getCached, setCache,
  listCachedDates, loadDiskCacheForDate,
  setCors,
} from '../../_lib/shared.js';

export default function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { id: usabId } = req.query;
  const cacheKey = `trend:${usabId}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  try {
    const dates = listCachedDates().sort();
    const trend = [];
    let playerName = '';

    for (const date of dates) {
      const disk = loadDiskCacheForDate(date);
      if (!disk || !disk.allPlayers) continue;
      const player = disk.allPlayers.find((p) => p.usabId === usabId);
      if (!player) continue;
      if (!playerName && player.name) playerName = player.name;
      trend.push({ date, entries: player.entries });
    }

    const result = { usabId, name: playerName, trend };
    setCache(cacheKey, result);
    return res.setHeader('X-Cache', 'MISS').status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
