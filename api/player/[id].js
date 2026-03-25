import { USAB_BASE, BROWSER_HEADERS, fetchWithRetry } from '../_lib/core.js';
import { parsePlayerDetail, parsePlayerGender } from '../_lib/rankingsData.js';
import { getDiskCachedDate } from '../_lib/rankingsDiskCache.js';
import { getCached, setCache, setCors } from '../_lib/runtime.js';
import { isValidUsabId, isValidAgeGroup, isValidEventType, isValidDate } from '../_lib/validation.js';
import {
  createRequestMetrics,
  sendApiError,
  sendJson,
  UpstreamError,
  ValidationError,
} from '../_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const metrics = createRequestMetrics('player');
  const defaultDate = await metrics.time('load_default_date', async () => getDiskCachedDate() || new Date().toISOString().slice(0, 10));
  const { id: usabId, age_group: ageGroup = 'U11', category: eventType = 'BS', date = defaultDate } = req.query;

  if (!usabId || !isValidUsabId(usabId)) return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  if (!isValidAgeGroup(ageGroup)) return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
  if (!isValidEventType(eventType)) return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
  if (!isValidDate(date)) return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));

  const cacheKey = `player:${usabId}:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached, metrics.buildHeaders({ 'X-Cache': 'HIT' }));

  try {
    const url = `${USAB_BASE}/${encodeURIComponent(usabId)}/details?age_group=${encodeURIComponent(ageGroup)}&category=${encodeURIComponent(eventType)}&date=${encodeURIComponent(date)}`;
    const response = await metrics.time('fetch_detail', () => fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 }));
    if (!response.ok) throw new UpstreamError(`USAB player detail HTTP ${response.status}`);
    const html = await metrics.time('read_html', () => response.text());
    const history = await metrics.time('parse_detail', async () => parsePlayerDetail(html));
    const gender = parsePlayerGender(html);
    const result = { gender, entries: history };
    setCache(cacheKey, result);
    metrics.log({ entries: history.length });
    return sendJson(res, 200, result, metrics.buildHeaders({ 'X-Cache': 'MISS' }));
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'player' });
  }
}
