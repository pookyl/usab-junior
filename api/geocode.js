import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { ValidationError } from './_lib/http.js';
import { sendJson, sendApiError, createRequestMetrics } from './_lib/http.js';

const DATA_DIR = join(process.cwd(), 'data');
const CACHE_PATH = join(DATA_DIR, 'geocode-cache.json');

let diskCache = null;

async function loadDiskCache() {
  if (diskCache) return diskCache;
  try {
    diskCache = JSON.parse(await readFile(CACHE_PATH, 'utf-8'));
  } catch {
    diskCache = {};
  }
  return diskCache;
}

const KNOWN_TYPOS = {
  mulkiteo: 'Mukilteo',
  mulkitea: 'Mukilteo',
};

function normalizeQuery(loc) {
  let q = loc.trim();
  q = q.replace(/,?\s*U\.?S\.?A\.?\s*$/i, '');
  q = q.replace(/,?\s*United States\s*$/i, '');
  q = q.trim();
  for (const [typo, fix] of Object.entries(KNOWN_TYPOS)) {
    q = q.replace(new RegExp(typo, 'gi'), fix);
  }
  return q;
}

let lastNominatimRequest = 0;

async function queryNominatim(q) {
  const elapsed = Date.now() - lastNominatimRequest;
  if (elapsed < 1500) await new Promise((r) => setTimeout(r, 1500 - elapsed));
  lastNominatimRequest = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'usab-junior-rankings/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.status === 429) {
      const wait = 3000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait));
      lastNominatimRequest = Date.now();
      continue;
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.length > 0 ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  }
  return null;
}

async function buildVenueLookups() {
  const venueByTswId = {};
  const venueByCity = {};
  try {
    const files = await readdir(DATA_DIR);
    for (const f of files) {
      if (!f.match(/^tournaments-\d{4}-\d{4}\.json$/)) continue;
      try {
        const raw = JSON.parse(await readFile(join(DATA_DIR, f), 'utf-8'));
        for (const t of raw.tournaments || []) {
          if (!t.venueLocation) continue;
          if (t.tswId) venueByTswId[t.tswId.toUpperCase()] = t.venueLocation;
          const cityMatch = t.venueLocation.match(/,\s*([^,]+),\s*[A-Z]{2}\b/);
          if (cityMatch) {
            const city = cityMatch[1].trim().toLowerCase();
            if (!venueByCity[city]) venueByCity[city] = t.venueLocation;
          }
        }
      } catch { /* skip bad file */ }
    }
  } catch { /* data dir missing */ }
  return { venueByTswId, venueByCity };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return sendApiError(res, new ValidationError('Method not allowed'));
  }

  const metrics = createRequestMetrics('geocode');

  try {
    const { locations, tswIds = {} } = req.body || {};
    if (!Array.isArray(locations) || locations.length === 0) {
      return sendApiError(res, new ValidationError('locations must be a non-empty array'));
    }
    if (locations.length > 100) {
      return sendApiError(res, new ValidationError('Too many locations (max 100)'));
    }

    const [cache, { venueByTswId, venueByCity }] = await metrics.time('init', () =>
      Promise.all([loadDiskCache(), buildVenueLookups()]),
    );

    const results = {};
    const toFetch = [];

    await metrics.time('cache_lookup', async () => {
      for (const loc of locations) {
        if (typeof loc !== 'string' || !loc.trim()) continue;
        const key = loc.trim().toLowerCase();
        if (key in cache) {
          results[loc] = cache[key];
        } else {
          toFetch.push(loc);
        }
      }
    });

    if (toFetch.length > 0) {
      await metrics.time('nominatim', async () => {
        for (const loc of toFetch) {
          const key = loc.trim().toLowerCase();
          const tswId = tswIds[loc];
          let venueAddress = tswId ? venueByTswId[tswId.toUpperCase()] : null;
          if (!venueAddress) {
            const city = normalizeQuery(loc).replace(/\s*&\s*.*/g, '').trim().toLowerCase();
            venueAddress = venueByCity[city] || null;
          }
          const queryString = venueAddress ? normalizeQuery(venueAddress) : normalizeQuery(loc);

          try {
            let coords = await queryNominatim(queryString);

            if (!coords && venueAddress) {
              const csMatch = venueAddress.match(/,\s*([^,]+),\s*([A-Z]{2})\b/);
              if (csMatch) {
                coords = await queryNominatim(`${normalizeQuery(csMatch[1])}, ${csMatch[2]}`);
              }
            }

            if (!coords && !venueAddress) {
              const plain = normalizeQuery(loc).replace(/\s*&\s*.*/g, '').trim();
              if (plain !== queryString) coords = await queryNominatim(plain);
            }

            results[loc] = coords;
            cache[key] = coords;
          } catch (err) {
            console.error(`[geocode] error for "${loc}":`, err.message);
            results[loc] = null;
          }
        }
      });
    }

    metrics.log({ total: locations.length, cached: locations.length - toFetch.length, fetched: toFetch.length });
    return sendJson(res, 200, results, metrics.buildHeaders());
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'geocode' });
  }
}
