import { TSW_ORG_CODE } from './_lib/core.js';
import { tswFetch } from './_lib/tswClient.js';
import { parseH2HContent } from './_lib/tswH2h.js';
import { getCached, setCache, setCors } from './_lib/runtime.js';
import { isValidUsabId } from './_lib/validation.js';
import {
  createRequestMetrics,
  sendApiError,
  sendJson,
  UpstreamError,
  ValidationError,
} from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { player1: p1, player2: p2 } = req.query;
  if (!p1 || !p2) {
    return sendApiError(res, new ValidationError('player1 and player2 query params required'));
  }
  if (!isValidUsabId(p1) || !isValidUsabId(p2)) {
    return sendApiError(res, new ValidationError('Invalid player ID format'));
  }

  const cacheKey = `h2h:${[p1, p2].sort().join(':')}`;
  const cached = getCached(cacheKey);
  const metrics = createRequestMetrics('h2h');
  if (cached) return sendJson(res, 200, cached, metrics.buildHeaders({ 'X-Cache': 'HIT' }));

  try {
    const path = `/head-2-head/Head2HeadContent?OrganizationCode=${TSW_ORG_CODE}&t1p1memberid=${encodeURIComponent(p1)}&t2p1memberid=${encodeURIComponent(p2)}`;
    const resp = await metrics.time('fetch_h2h', () => tswFetch(path));
    if (!resp.ok) throw new UpstreamError(`TSW HTTP ${resp.status}`);
    const html = await metrics.time('read_html', () => resp.text());
    const data = await metrics.time('parse_h2h', async () => parseH2HContent(html, resp.headers));
    setCache(cacheKey, data);
    metrics.log({ matches: data.matches.length });
    return sendJson(res, 200, data, metrics.buildHeaders({ 'X-Cache': 'MISS' }));
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'h2h' });
  }
}
