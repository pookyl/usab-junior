import {
  setCors, getCached, setCache,
  tswFetch, parseTswMatches, parseTswMatchDates, isValidTswId,
  formatMatchDate,
} from '../../_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const tswId = req.query?.tswId || req.url?.match(/\/tournaments\/([^/?]+)\/matches/)?.[1];
  if (!tswId || !isValidTswId(tswId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tswId parameter required' }));
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const dateParam = req.query?.d || urlObj.searchParams.get('d') || '';
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';

  // Without ?d= → return only dates (lightweight)
  // With ?d=YYYYMMDD → return matches for that day
  if (!dateParam) {
    const datesCacheKey = `tournament-match-dates:${tswId}`;
    const cached = getCached(datesCacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify({ tswId, dates: cached }));
      return;
    }

    try {
      const parentResp = await tswFetch(`/sport/matches.aspx?id=${encodeURIComponent(tswId)}`);
      if (!parentResp.ok) throw new Error(`TSW matches page HTTP ${parentResp.status}`);
      const parentHtml = await parentResp.text();
      const dates = parseTswMatchDates(parentHtml);
      setCache(datesCacheKey, dates);

      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
      res.end(JSON.stringify({ tswId, dates }));
    } catch (err) {
      console.error('[tournament-matches] dates error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Fetch matches for a specific date
  const cacheKey = `tournament-matches-day:${tswId}:${dateParam}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify({ tswId, date: formatMatchDate(dateParam), matches: cached }));
    return;
    }
  }

  try {
    const matchResp = await tswFetch(
      `/tournament/${tswId.toLowerCase()}/Matches/MatchesInDay?date=${encodeURIComponent(dateParam)}`,
    );
    if (!matchResp.ok) throw new Error(`TSW matches AJAX HTTP ${matchResp.status}`);
    const matchHtml = await matchResp.text();
    const matches = parseTswMatches(matchHtml);
    setCache(cacheKey, matches);

    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify({ tswId, date: formatMatchDate(dateParam), matches }));
  } catch (err) {
    console.error('[tournament-matches] day error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
