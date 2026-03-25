import { getDiskCachedAllPlayers, getDiskCachedDate } from './_lib/rankingsDiskCache.js';
import { getCached, setCache, setCors } from './_lib/runtime.js';
import { isValidDate } from './_lib/validation.js';
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

  const metrics = createRequestMetrics('all-players');
  const defaultDate = await metrics.time('load_default_date', async () => getDiskCachedDate() || new Date().toISOString().slice(0, 10));
  const { date = defaultDate } = req.query;

  if (!isValidDate(date)) return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));

  const cacheKey = `all-players:${date}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return sendJson(res, 200, cached, metrics.buildHeaders({ 'X-Cache': 'HIT', 'X-Partial': 'false' }));
  }

  const perDateDisk = await metrics.time('load_requested_date', () => getDiskCachedAllPlayers(date));
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk.players);
    metrics.log({ source: 'requested-date', count: perDateDisk.players.length });
    return sendJson(res, 200, perDateDisk.players, metrics.buildHeaders({ 'X-Cache': 'DISK', 'X-Partial': 'false' }));
  }

  const fallback = await metrics.time('load_latest_date', () => getDiskCachedAllPlayers());
  if (fallback) {
    metrics.log({ source: 'latest-date', count: fallback.players.length });
    return sendJson(res, 200, fallback.players, metrics.buildHeaders({ 'X-Cache': 'DISK', 'X-Partial': 'false' }));
  }

  return sendApiError(res, new UnavailableError('No data available'));
}
