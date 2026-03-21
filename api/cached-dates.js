import { listCachedDates, setCors } from './_lib/shared.js';
import { sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const dates = await listCachedDates();
  return sendJson(res, 200, { dates });
}
