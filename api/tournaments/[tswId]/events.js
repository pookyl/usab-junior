import {
  setCors, getCached, setCache,
  tswFetch, parseTswEvents, isValidTswId,
} from '../../_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const tswId = req.query?.tswId || req.url?.match(/\/tournaments\/([^/?]+)\/events/)?.[1];
  if (!tswId || !isValidTswId(tswId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tswId parameter required' }));
    return;
  }

  const cacheKey = `tournament-events:${tswId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
    const eventsPath = `/sport/events.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = await tswFetch(eventsPath);
    if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
    const html = await resp.text();

    const events = parseTswEvents(html);
    const result = { tswId, events };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-events] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
