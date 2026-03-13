import {
  TSW_ORG_CODE,
  getCached, setCache,
  tswFetch, parseH2HContent,
  setCors, isValidUsabId,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { player1: p1, player2: p2 } = req.query;
  if (!p1 || !p2) {
    return res.status(400).json({ error: 'player1 and player2 query params required' });
  }
  if (!isValidUsabId(p1) || !isValidUsabId(p2)) {
    return res.status(400).json({ error: 'Invalid player ID format' });
  }

  const cacheKey = `h2h:${[p1, p2].sort().join(':')}`;
  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  try {
    const path = `/head-2-head/Head2HeadContent?OrganizationCode=${TSW_ORG_CODE}&t1p1memberid=${encodeURIComponent(p1)}&t2p1memberid=${encodeURIComponent(p2)}`;
    const resp = await tswFetch(path);
    if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
    const html = await resp.text();
    const data = parseH2HContent(html, resp.headers);
    setCache(cacheKey, data);
    return res.setHeader('X-Cache', 'MISS').status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
