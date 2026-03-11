import {
  USAB_BASE, BROWSER_HEADERS,
  getCached, setCache, getDiskCachedDate,
  parsePlayerDetail, parsePlayerGender,
  setCors,
} from '../_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const { id: usabId, age_group: ageGroup = 'U11', category: eventType = 'BS', date = defaultDate } = req.query;
  const cacheKey = `player:${usabId}:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  try {
    const url = `${USAB_BASE}/${usabId}/details?age_group=${ageGroup}&category=${eventType}&date=${date}`;
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const history = parsePlayerDetail(html);
    const gender = parsePlayerGender(html);
    const result = { gender, entries: history };
    setCache(cacheKey, result);
    return res.setHeader('X-Cache', 'MISS').status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
