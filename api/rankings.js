import { getDiskCachedRankings, getDiskCachedDate } from './_lib/rankingsDiskCache.js';
import { getCached, setCache, setCors } from './_lib/runtime.js';
import { isValidAgeGroup, isValidDate, isValidEventType } from './_lib/validation.js';
import {
  createRequestMetrics,
  sendApiError,
  sendJson,
  ValidationError,
  UnavailableError,
} from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const metrics = createRequestMetrics('rankings');
  const defaultDate = await metrics.time('load_default_date', async () => getDiskCachedDate() || new Date().toISOString().slice(0, 10));
  const { age_group: ageGroup = 'U11', category: eventType = 'BS', date = defaultDate } = req.query;

  if (!isValidAgeGroup(ageGroup)) return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
  if (!isValidEventType(eventType)) return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
  if (!isValidDate(date)) return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));

  const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached, metrics.buildHeaders({ 'X-Cache': 'HIT' }));

  const diskKey = `${ageGroup}-${eventType}`;
  const perDateDisk = await metrics.time('load_requested_date', () => getDiskCachedRankings(diskKey, date));
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk);
    metrics.log({ source: 'requested-date', count: perDateDisk.length, diskKey });
    return sendJson(res, 200, perDateDisk, metrics.buildHeaders({ 'X-Cache': 'DISK' }));
  }

  const fallback = await metrics.time('load_latest_date', () => getDiskCachedRankings(diskKey));
  if (fallback) {
    metrics.log({ source: 'latest-date', count: fallback.length, diskKey });
    return sendJson(res, 200, fallback, metrics.buildHeaders({ 'X-Cache': 'DISK' }));
  }

  return sendApiError(res, new UnavailableError('No data available'));
}
