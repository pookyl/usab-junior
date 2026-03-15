import {
  setCors, getCached, setCache,
  tswFetch, parseTswTournamentPlayersArray, isValidTswId,
  TSW_BASE,
} from '../../_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const tswId = req.query?.tswId || req.url?.match(/\/tournaments\/([^/?]+)\/players/)?.[1];
  if (!tswId || !isValidTswId(tswId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tswId parameter required' }));
    return;
  }

  const cacheKey = `tournament-players:${tswId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
    const playersUrl = `/tournament/${tswId.toLowerCase()}/Players/GetPlayersContent`;
    const resp = await tswFetch(playersUrl, {
      method: 'POST',
      extraHeaders: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${TSW_BASE}/tournament/${tswId}/players`,
      },
      body: '',
    });
    if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
    const html = await resp.text();

    const players = parseTswTournamentPlayersArray(html);
    const result = { tswId, players };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-players] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
