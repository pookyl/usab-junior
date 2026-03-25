import { listCachedDates } from './_lib/rankingsDiskCache.js';
import { setCors } from './_lib/runtime.js';
import { createRequestMetrics, sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const metrics = createRequestMetrics('cached-dates');
  const dates = await metrics.time('list_dates', () => listCachedDates());
  metrics.log({ count: dates.length });
  return sendJson(res, 200, { dates }, metrics.buildHeaders());
}
