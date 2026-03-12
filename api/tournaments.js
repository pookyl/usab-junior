import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { setCors, getCached, setCache } from './_lib/shared.js';

const DATA_DIR = join(process.cwd(), 'data');

async function listTournamentSeasons() {
  try {
    const files = await readdir(DATA_DIR);
    const seasons = [];
    for (const f of files) {
      const m = f.match(/^tournaments-(\d{4}-\d{4})\.json$/);
      if (m) seasons.push(m[1]);
    }
    return seasons.sort().reverse();
  } catch {
    return [];
  }
}

async function loadSeasonCache(season) {
  try {
    const raw = await readFile(join(DATA_DIR, `tournaments-${season}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function recomputeStatuses(tournaments) {
  const today = new Date().toISOString().slice(0, 10);
  return tournaments.map(t => {
    if (!t.startDate) return { ...t, status: 'upcoming' };
    let status;
    if (today > t.endDate) status = 'completed';
    else if (today >= t.startDate) status = 'in-progress';
    else status = 'upcoming';
    return { ...t, status };
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const season = url.searchParams.get('season');

  const cacheKey = `tournaments:${season || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  const availableSeasons = await listTournamentSeasons();
  if (availableSeasons.length === 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ seasons: {}, availableSeasons: [] }));
    return;
  }

  let result;
  if (season) {
    const data = await loadSeasonCache(season);
    result = {
      season,
      tournaments: data ? recomputeStatuses(data.tournaments) : [],
      availableSeasons,
    };
  } else {
    const allSeasons = {};
    for (const s of availableSeasons) {
      const data = await loadSeasonCache(s);
      if (data) allSeasons[s] = { tournaments: recomputeStatuses(data.tournaments) };
    }
    result = { seasons: allSeasons, availableSeasons };
  }

  setCache(cacheKey, result);
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'DISK' });
  res.end(JSON.stringify(result));
}
