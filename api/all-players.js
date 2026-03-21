import {
  getCached, setCache, getDiskCachedAllPlayers, getDiskCachedDate,
  setCors, isValidDate,
} from './_lib/shared.js';
import { sendApiError, sendJson, ValidationError, UnavailableError } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const { date = defaultDate } = req.query;

  if (!isValidDate(date)) return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));

  const cacheKey = `all-players:${date}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return sendJson(res, 200, cached, { 'X-Cache': 'HIT', 'X-Partial': 'false' });
  }

  const perDateDisk = await getDiskCachedAllPlayers(date);
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk.players);
    return sendJson(res, 200, perDateDisk.players, { 'X-Cache': 'DISK', 'X-Partial': 'false' });
  }

  const fallback = await getDiskCachedAllPlayers();
  if (fallback) {
    return sendJson(res, 200, fallback.players, { 'X-Cache': 'DISK', 'X-Partial': 'false' });
  }

  return sendApiError(res, new UnavailableError('No data available'));
}
