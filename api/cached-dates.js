import { listCachedDates, setCors } from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const dates = await listCachedDates();
  return res.status(200).json({ dates });
}
