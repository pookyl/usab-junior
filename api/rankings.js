import {
  getCached, setCache, getDiskCachedRankings, getDiskCachedDate,
  setCors, isValidDate, isValidAgeGroup, isValidEventType,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const { age_group: ageGroup = 'U11', category: eventType = 'BS', date = defaultDate } = req.query;

  if (!isValidAgeGroup(ageGroup)) return res.status(400).json({ error: 'Invalid age_group' });
  if (!isValidEventType(eventType)) return res.status(400).json({ error: 'Invalid category' });
  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date format' });

  const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  const diskKey = `${ageGroup}-${eventType}`;
  const perDateDisk = await getDiskCachedRankings(diskKey, date);
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk);
    return res.setHeader('X-Cache', 'DISK').status(200).json(perDateDisk);
  }

  const fallback = await getDiskCachedRankings(diskKey);
  if (fallback) {
    return res.setHeader('X-Cache', 'DISK').status(200).json(fallback);
  }

  return res.status(503).json({ error: 'No data available' });
}
