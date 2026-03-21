import {
  USAB_BASE, BROWSER_HEADERS,
  getCached, setCache, getDiskCachedDate,
  fetchWithRetry,
  parsePlayerDetail, parsePlayerGender,
  setCors, isValidUsabId, isValidAgeGroup, isValidEventType, isValidDate,
} from '../_lib/shared.js';
import { sendApiError, sendJson, UpstreamError, ValidationError } from '../_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const { id: usabId, age_group: ageGroup = 'U11', category: eventType = 'BS', date = defaultDate } = req.query;

  if (!usabId || !isValidUsabId(usabId)) return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  if (!isValidAgeGroup(ageGroup)) return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
  if (!isValidEventType(eventType)) return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
  if (!isValidDate(date)) return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));

  const cacheKey = `player:${usabId}:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached, { 'X-Cache': 'HIT' });

  try {
    const url = `${USAB_BASE}/${encodeURIComponent(usabId)}/details?age_group=${encodeURIComponent(ageGroup)}&category=${encodeURIComponent(eventType)}&date=${encodeURIComponent(date)}`;
    const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
    if (!response.ok) throw new UpstreamError(`USAB player detail HTTP ${response.status}`);
    const html = await response.text();
    const history = parsePlayerDetail(html);
    const gender = parsePlayerGender(html);
    const result = { gender, entries: history };
    setCache(cacheKey, result);
    return sendJson(res, 200, result, { 'X-Cache': 'MISS' });
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'player' });
  }
}
