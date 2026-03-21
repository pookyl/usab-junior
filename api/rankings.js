import {
  getCached, setCache, getDiskCachedRankings, getDiskCachedDate,
  setCors, isValidDate, isValidAgeGroup, isValidEventType,
} from './_lib/shared.js';
import { sendApiError, sendJson, ValidationError, UnavailableError } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const { age_group: ageGroup = 'U11', category: eventType = 'BS', date = defaultDate } = req.query;

  if (!isValidAgeGroup(ageGroup)) return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
  if (!isValidEventType(eventType)) return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
  if (!isValidDate(date)) return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));

  const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached, { 'X-Cache': 'HIT' });

  const diskKey = `${ageGroup}-${eventType}`;
  const perDateDisk = await getDiskCachedRankings(diskKey, date);
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk);
    return sendJson(res, 200, perDateDisk, { 'X-Cache': 'DISK' });
  }

  const fallback = await getDiskCachedRankings(diskKey);
  if (fallback) {
    return sendJson(res, 200, fallback, { 'X-Cache': 'DISK' });
  }

  return sendApiError(res, new UnavailableError('No data available'));
}
