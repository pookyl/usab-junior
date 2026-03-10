import { listCachedDates, setCors } from './_lib/shared.js';

export default function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const dates = listCachedDates();
  return res.status(200).json({ dates });
}
