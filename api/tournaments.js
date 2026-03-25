import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { getCached, setCache, setCors } from './_lib/runtime.js';
import { sendApiError, sendJson, ValidationError } from './_lib/http.js';

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
    const end = t.endDate || t.startDate;
    let status;
    if (today > end) status = 'completed';
    else if (today >= t.startDate) status = 'in-progress';
    else status = 'upcoming';
    return { ...t, status };
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const season = url.searchParams.get('season');
    const spotlightOnly = url.searchParams.get('spotlight') === 'true';

    if (season && !/^\d{4}-\d{4}$/.test(season)) {
      return sendApiError(res, new ValidationError('Invalid season format', { field: 'season' }));
    }

    const cacheKey = spotlightOnly ? 'tournaments:spotlight' : `tournaments:${season || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return sendJson(res, 200, cached, { 'X-Cache': 'HIT' });
    }

    const availableSeasons = await listTournamentSeasons();
    if (availableSeasons.length === 0) {
      const empty = spotlightOnly ? { spotlight: [] } : { seasons: {}, availableSeasons: [] };
      return sendJson(res, 200, empty);
    }

  let allTournaments = [];
  if (spotlightOnly) {
    for (const s of availableSeasons) {
      const data = await loadSeasonCache(s);
      if (data) allTournaments.push(...recomputeStatuses(data.tournaments));
    }

    const MAX_SPOTLIGHT = 3;
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
    const inProgress = allTournaments.filter(t => t.status === 'in-progress');
    let spotlight = [];
    if (inProgress.length > 0) {
      spotlight = inProgress;
    } else {
      const completed = allTournaments
        .filter(t => t.status === 'completed' && t.endDate)
        .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
      const upcoming = allTournaments
        .filter(t => t.status === 'upcoming' && t.startDate)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      const recentCompleted = completed[0] ?? null;
      const nextUpcoming = upcoming[0] ?? null;
      if (recentCompleted && (todayMs - new Date(recentCompleted.endDate).getTime()) < TWO_DAYS_MS) {
        spotlight = [recentCompleted];
      } else if (nextUpcoming) {
        spotlight = upcoming.filter(t => t.startDate === nextUpcoming.startDate);
      } else if (recentCompleted) {
        spotlight = [recentCompleted];
      }
    }
    const result = { spotlight: spotlight.slice(0, MAX_SPOTLIGHT) };
    setCache(cacheKey, result);
    return sendJson(res, 200, result, { 'X-Cache': 'DISK' });
  }

  let result;
  if (season) {
    const data = await loadSeasonCache(season);
    const list = data ? recomputeStatuses(data.tournaments) : [];
    result = {
      season,
      tournaments: list,
      availableSeasons,
    };
  } else {
    const allSeasons = {};
    for (const s of availableSeasons) {
      const data = await loadSeasonCache(s);
      if (data) {
        const list = recomputeStatuses(data.tournaments);
        allSeasons[s] = { tournaments: list };
      }
    }
    result = { seasons: allSeasons, availableSeasons };
  }

    setCache(cacheKey, result);
    return sendJson(res, 200, result, { 'X-Cache': 'DISK' });
  } catch (err) {
    return sendApiError(res, err, { logLabel: 'tournaments' });
  }
}
