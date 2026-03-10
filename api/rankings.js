import {
  USAB_BASE, BROWSER_HEADERS,
  getCached, setCache, getDiskCachedRankings,
  parseRankings, setCors,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { age_group: ageGroup = 'U11', category: eventType = 'BS', date = '2026-03-01' } = req.query;
  const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  // Check per-date disk cache first
  const diskKey = `${ageGroup}-${eventType}`;
  const perDateDisk = getDiskCachedRankings(diskKey, date);
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk);
    return res.setHeader('X-Cache', 'DISK').status(200).json(perDateDisk);
  }

  try {
    const url = `${USAB_BASE}/?age_group=${ageGroup}&category=${eventType}&date=${date}`;
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const players = parseRankings(html, ageGroup, eventType);
    setCache(cacheKey, players);
    return res.setHeader('X-Cache', 'MISS').status(200).json(players);
  } catch (err) {
    const diskData = getDiskCachedRankings(diskKey);
    if (diskData) {
      return res.setHeader('X-Cache', 'DISK').status(200).json(diskData);
    }
    return res.status(500).json({ error: err.message });
  }
}
