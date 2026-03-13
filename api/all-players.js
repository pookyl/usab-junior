import {
  getCached, setCache, getDiskCachedAllPlayers, getDiskCachedDate,
  setCors, isValidDate,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const { date = defaultDate } = req.query;

  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date format' });

  const cacheKey = `all-players:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  const perDateDisk = await getDiskCachedAllPlayers(date);
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk.players);
    return res.setHeader('X-Cache', 'DISK').status(200).json(perDateDisk.players);
  }

  const fallback = await getDiskCachedAllPlayers();
  if (fallback) {
    return res.setHeader('X-Cache', 'DISK').status(200).json(fallback.players);
  }

  return res.status(503).json({ error: 'No data available' });
}
