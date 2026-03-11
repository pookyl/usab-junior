import {
  USAB_BASE, BROWSER_HEADERS,
  getCached, setCache, getDiskCachedDate,
  setCors,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cacheKey = 'latest-date';
  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  try {
    const response = await fetch(USAB_BASE, { headers: BROWSER_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    const dates = [];
    const optionRegex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
    let om;
    while ((om = optionRegex.exec(html)) !== null) {
      const val = om[1].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) dates.push(val);
    }

    const latestDate = dates.length > 0 ? dates[0] : null;
    const result = { latestDate, availableDates: dates };
    setCache(cacheKey, result);
    return res.setHeader('X-Cache', 'MISS').status(200).json(result);
  } catch (err) {
    const diskDate = await getDiskCachedDate();
    if (diskDate) {
      return res.setHeader('X-Cache', 'DISK').status(200).json({
        latestDate: diskDate,
        availableDates: [diskDate],
      });
    }
    return res.status(500).json({ error: err.message });
  }
}
