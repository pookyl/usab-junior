/**
 * Lightweight proxy API server that fetches and parses data from
 * usabjrrankings.org and tournamentsoftware.com server-side,
 * avoiding any browser CORS/DOMParser issues.
 * Runs on port 3001 alongside the Vite dev server.
 */
import { createServer } from 'http';
import { URL } from 'url';
import { readFile, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';

import {
  USAB_BASE, TSW_BASE, TSW_ORG_CODE, BROWSER_HEADERS,
  getCached, setCache,
  fetchWithRetry,
  parseRankings, parsePlayerGender, parsePlayerDetail,
  parseH2HContent,
  tswFetch,
  isValidDate, isValidAgeGroup, isValidEventType, isValidUsabId, isValidSeason,
} from './api/_lib/shared.js';
import {
  listCachedDates,
  loadDiskCacheForDate,
  getDiskCachedRankings,
  getDiskCachedAllPlayers,
  getDiskCachedDate,
  saveDiskCache,
} from './api/_lib/rankingsDiskCache.js';
import {
  sendJson,
  sendApiError,
  ValidationError,
  UpstreamError,
  UnavailableError,
} from './api/_lib/http.js';

const PORT = process.env.PORT || 3001;
const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function getDefaultDate() {
  const dates = await listCachedDates();
  if (dates[0]) return dates[0];
  const diskDate = await getDiskCachedDate();
  if (diskDate && isValidDate(diskDate)) return diskDate;
  return new Date().toISOString().slice(0, 10);
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    const defaultDate = await getDefaultDate();

  // GET /api/rankings?age_group=U13&category=BS&date=2026-03-01
  if (reqUrl.pathname === '/api/rankings') {
    const ageGroup = reqUrl.searchParams.get('age_group') ?? 'U11';
    const eventType = reqUrl.searchParams.get('category') ?? 'BS';
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    if (!isValidAgeGroup(ageGroup)) {
      return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
    }
    if (!isValidEventType(eventType)) {
      return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
    }
    if (!isValidDate(date)) {
      return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));
    }
    const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const diskKey = `${ageGroup}-${eventType}`;
    const perDateDisk = await getDiskCachedRankings(diskKey, date);
    if (perDateDisk) {
      console.log(`[rankings] serving from per-date disk cache for ${diskKey} date=${date}`);
      setCache(cacheKey, perDateDisk);
      res.writeHead(200, { 'X-Cache': 'DISK' });
      res.end(JSON.stringify(perDateDisk));
      return;
    }

    try {
      const url = `${USAB_BASE}/?age_group=${encodeURIComponent(ageGroup)}&category=${encodeURIComponent(eventType)}&date=${encodeURIComponent(date)}`;
      console.log(`[rankings] fetching ${url}`);
      const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
      if (!response.ok) throw new UpstreamError(`USAB rankings HTTP ${response.status}`);
      const html = await response.text();
      const players = parseRankings(html, ageGroup, eventType);
      console.log(`[rankings] parsed ${players.length} players for ${ageGroup} ${eventType}`);
      setCache(cacheKey, players);
      sendJson(res, 200, players, { 'X-Cache': 'MISS' });
    } catch (err) {
      console.error(`[rankings] error:`, err.message);
      const diskData = await getDiskCachedRankings(diskKey);
      if (diskData) {
        console.log(`[rankings] serving from disk cache for ${diskKey}`);
        sendJson(res, 200, diskData, { 'X-Cache': 'DISK' });
      } else {
        sendApiError(res, new UnavailableError('No data available'));
      }
    }
    return;
  }

  // GET /api/player/:usabId?age_group=U11&category=BS&date=2026-03-01
  const playerMatch = reqUrl.pathname.match(/^\/api\/player\/(\d+)$/);
  if (playerMatch) {
    const usabId = playerMatch[1];
    const ageGroup = reqUrl.searchParams.get('age_group') ?? 'U11';
    const eventType = reqUrl.searchParams.get('category') ?? 'BS';
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    if (!isValidUsabId(usabId)) {
      return sendApiError(res, new ValidationError('Invalid player ID format', { field: 'id' }));
    }
    if (!isValidAgeGroup(ageGroup)) {
      return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
    }
    if (!isValidEventType(eventType)) {
      return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
    }
    if (!isValidDate(date)) {
      return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));
    }
    const cacheKey = `player:${usabId}:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const url = `${USAB_BASE}/${encodeURIComponent(usabId)}/details?age_group=${encodeURIComponent(ageGroup)}&category=${encodeURIComponent(eventType)}&date=${encodeURIComponent(date)}`;
      console.log(`[player] fetching ${url}`);
      const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
      if (!response.ok) throw new UpstreamError(`USAB player detail HTTP ${response.status}`);
      const html = await response.text();
      const history = parsePlayerDetail(html);
      const gender = parsePlayerGender(html);
      console.log(`[player] parsed ${history.length} tournament entries for USAB ${usabId}, gender=${gender}`);
      const result = { gender, entries: history };
      setCache(cacheKey, result);
      sendJson(res, 200, result, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'player' });
    }
    return;
  }

  // GET /api/h2h?player1=446477&player2=530254
  if (reqUrl.pathname === '/api/h2h') {
    const p1 = reqUrl.searchParams.get('player1');
    const p2 = reqUrl.searchParams.get('player2');
    if (!p1 || !p2) {
      return sendApiError(res, new ValidationError('player1 and player2 query params required'));
    }
    if (!isValidUsabId(p1) || !isValidUsabId(p2)) {
      return sendApiError(res, new ValidationError('Invalid player ID format'));
    }
    const cacheKey = `h2h:${[p1, p2].sort().join(':')}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const path = `/head-2-head/Head2HeadContent?OrganizationCode=${TSW_ORG_CODE}&t1p1memberid=${encodeURIComponent(p1)}&t2p1memberid=${encodeURIComponent(p2)}`;
      console.log(`[h2h] fetching ${TSW_BASE}${path}`);
      const resp = await tswFetch(path);
      if (!resp.ok) throw new UpstreamError(`TSW HTTP ${resp.status}`);
      const html = await resp.text();
      const data = parseH2HContent(html, resp.headers);
      console.log(`[h2h] parsed ${data.matches.length} matches, score ${data.team1wins}-${data.team2wins}`);
      setCache(cacheKey, data);
      sendJson(res, 200, data, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'h2h' });
    }
    return;
  }

  // GET /api/tournaments?season=2025-2026
  if (reqUrl.pathname === '/api/tournaments') {
    const season = reqUrl.searchParams.get('season');
    if (season && !isValidSeason(season)) {
      return sendApiError(res, new ValidationError('Invalid season format', { field: 'season' }));
    }
    const cacheKey = `tournaments:${season || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const tournamentDir = join(__dirname, 'data');
      const availableSeasons = [];
      if (existsSync(tournamentDir)) {
        for (const f of await readdir(tournamentDir)) {
          const m = f.match(/^tournaments-(\d{4}-\d{4})\.json$/);
          if (m) availableSeasons.push(m[1]);
        }
      }
      availableSeasons.sort().reverse();

      if (availableSeasons.length === 0) {
        sendJson(res, 200, { seasons: {}, availableSeasons: [] });
        return;
      }

      const REGION_TIME_ZONES = {
        NW: 'America/Los_Angeles',
        NorCal: 'America/Los_Angeles',
        SoCal: 'America/Los_Angeles',
        MW: 'America/Chicago',
        South: 'America/Chicago',
        NE: 'America/New_York',
        National: 'America/New_York',
      };
      const STATE_TIME_ZONES = {
        AL: 'America/Chicago',
        AK: 'America/Anchorage',
        AZ: 'America/Phoenix',
        AR: 'America/Chicago',
        CA: 'America/Los_Angeles',
        CO: 'America/Denver',
        CT: 'America/New_York',
        DE: 'America/New_York',
        FL: 'America/New_York',
        GA: 'America/New_York',
        HI: 'Pacific/Honolulu',
        ID: 'America/Denver',
        IL: 'America/Chicago',
        IN: 'America/Indiana/Indianapolis',
        IA: 'America/Chicago',
        KS: 'America/Chicago',
        KY: 'America/New_York',
        LA: 'America/Chicago',
        ME: 'America/New_York',
        MD: 'America/New_York',
        MA: 'America/New_York',
        MI: 'America/Detroit',
        MN: 'America/Chicago',
        MS: 'America/Chicago',
        MO: 'America/Chicago',
        MT: 'America/Denver',
        NE: 'America/Chicago',
        NV: 'America/Los_Angeles',
        NH: 'America/New_York',
        NJ: 'America/New_York',
        NM: 'America/Denver',
        NY: 'America/New_York',
        NC: 'America/New_York',
        ND: 'America/Chicago',
        OH: 'America/New_York',
        OK: 'America/Chicago',
        OR: 'America/Los_Angeles',
        PA: 'America/New_York',
        RI: 'America/New_York',
        SC: 'America/New_York',
        SD: 'America/Chicago',
        TN: 'America/Chicago',
        TX: 'America/Chicago',
        UT: 'America/Denver',
        VT: 'America/New_York',
        VA: 'America/New_York',
        WA: 'America/Los_Angeles',
        WV: 'America/New_York',
        WI: 'America/Chicago',
        WY: 'America/Denver',
        DC: 'America/New_York',
      };
      const STATE_NAME_TO_CODE = {
        Alabama: 'AL',
        Alaska: 'AK',
        Arizona: 'AZ',
        Arkansas: 'AR',
        California: 'CA',
        Colorado: 'CO',
        Connecticut: 'CT',
        Delaware: 'DE',
        Florida: 'FL',
        Georgia: 'GA',
        Hawaii: 'HI',
        Idaho: 'ID',
        Illinois: 'IL',
        Indiana: 'IN',
        Iowa: 'IA',
        Kansas: 'KS',
        Kentucky: 'KY',
        Louisiana: 'LA',
        Maine: 'ME',
        Maryland: 'MD',
        Massachusetts: 'MA',
        Michigan: 'MI',
        Minnesota: 'MN',
        Mississippi: 'MS',
        Missouri: 'MO',
        Montana: 'MT',
        Nebraska: 'NE',
        Nevada: 'NV',
        'New Hampshire': 'NH',
        'New Jersey': 'NJ',
        'New Mexico': 'NM',
        'New York': 'NY',
        'North Carolina': 'NC',
        'North Dakota': 'ND',
        Ohio: 'OH',
        Oklahoma: 'OK',
        Oregon: 'OR',
        Pennsylvania: 'PA',
        'Rhode Island': 'RI',
        'South Carolina': 'SC',
        'South Dakota': 'SD',
        Tennessee: 'TN',
        Texas: 'TX',
        Utah: 'UT',
        Vermont: 'VT',
        Virginia: 'VA',
        Washington: 'WA',
        'West Virginia': 'WV',
        Wisconsin: 'WI',
        Wyoming: 'WY',
        'District of Columbia': 'DC',
      };
      const dateFormatterByTimeZone = new Map();

      function getDateFormatter(timeZone) {
        if (!dateFormatterByTimeZone.has(timeZone)) {
          dateFormatterByTimeZone.set(
            timeZone,
            new Intl.DateTimeFormat('en-US', {
              timeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }),
          );
        }
        return dateFormatterByTimeZone.get(timeZone);
      }

      function todayInTimeZone(timeZone) {
        try {
          const formatter = getDateFormatter(timeZone);
          const parts = formatter.formatToParts(new Date());
          const year = parts.find((p) => p.type === 'year')?.value;
          const month = parts.find((p) => p.type === 'month')?.value;
          const day = parts.find((p) => p.type === 'day')?.value;
          if (year && month && day) return `${year}-${month}-${day}`;
        } catch {
          // Fall back to UTC date below.
        }
        return new Date().toISOString().slice(0, 10);
      }

      function extractStateCode(location) {
        if (!location) return null;
        const text = String(location).replace(/\./g, '').trim();
        const postalMatches = [...text.matchAll(/,\s*([A-Z]{2})(?=(?:\s+\d{5}(?:-\d{4})?)?(?:,|$))/g)];
        for (let i = postalMatches.length - 1; i >= 0; i--) {
          const code = postalMatches[i][1];
          if (STATE_TIME_ZONES[code]) return code;
        }
        for (const [stateName, code] of Object.entries(STATE_NAME_TO_CODE)) {
          if (new RegExp(`\\b${stateName.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)) {
            return code;
          }
        }
        return null;
      }

      function getTournamentTimeZone(tournament) {
        const stateCode = extractStateCode(tournament.venueLocation);
        if (stateCode) return STATE_TIME_ZONES[stateCode];
        return REGION_TIME_ZONES[tournament.region] || 'UTC';
      }

      function recomputeStatuses(tournaments) {
        const todayByTimeZone = new Map();
        return tournaments.map(t => {
          if (!t.startDate) return { ...t, status: 'upcoming' };
          const end = t.endDate || t.startDate;
          const timeZone = getTournamentTimeZone(t);
          if (!todayByTimeZone.has(timeZone)) {
            todayByTimeZone.set(timeZone, todayInTimeZone(timeZone));
          }
          const today = todayByTimeZone.get(timeZone);
          let status;
          if (today > end) status = 'completed';
          else if (today >= t.startDate) status = 'in-progress';
          else status = 'upcoming';
          return { ...t, status };
        });
      }

      async function loadSeason(s) {
        if (!isValidSeason(s)) return null;
        try {
          const raw = await readFile(join(tournamentDir, `tournaments-${s}.json`), 'utf-8');
          return JSON.parse(raw);
        } catch { return null; }
      }

      let result;
      let allTournaments = [];
      if (season) {
        const data = await loadSeason(season);
        const list = data ? recomputeStatuses(data.tournaments) : [];
        allTournaments = list;
        result = {
          season,
          tournaments: list,
          availableSeasons,
        };
      } else {
        const allSeasons = {};
        for (const s of availableSeasons) {
          const data = await loadSeason(s);
          if (data) {
            const list = recomputeStatuses(data.tournaments);
            allSeasons[s] = { tournaments: list };
            allTournaments.push(...list);
          }
        }
        result = { seasons: allSeasons, availableSeasons };
      }

      // Pick spotlight: in-progress > closest to today (upcoming or recently completed)
      const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
      const inProgress = allTournaments.filter(t => t.status === 'in-progress');
      let spotlight = null;
      if (inProgress.length > 0) {
        spotlight = inProgress[0];
      } else {
        const completed = allTournaments
          .filter(t => t.status === 'completed' && t.endDate)
          .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
        const upcoming = allTournaments
          .filter(t => t.status === 'upcoming' && t.startDate)
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        const recentCompleted = completed[0] ?? null;
        const nextUpcoming = upcoming[0] ?? null;
        if (recentCompleted && nextUpcoming) {
          const completedGap = todayMs - new Date(recentCompleted.endDate).getTime();
          const upcomingGap = new Date(nextUpcoming.startDate).getTime() - todayMs;
          spotlight = upcomingGap <= completedGap ? nextUpcoming : recentCompleted;
        } else {
          spotlight = nextUpcoming ?? recentCompleted;
        }
      }
      result.spotlight = spotlight;

      setCache(cacheKey, result);
      console.log(`[tournaments] serving ${season || 'all'} (${availableSeasons.length} seasons available)`);
      sendJson(res, 200, result, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'tournaments' });
    }
    return;
  }

  // GET /api/tournaments/:tswId/:action — unified tournament action dispatcher
  const tournamentActionMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/([a-z][-a-z]*)$/);
  if (tournamentActionMatch) {
    const { default: actionHandler } = await import('./api/tournaments/[tswId]/[action].js');
    req.query = {
      tswId: tournamentActionMatch[1],
      action: tournamentActionMatch[2],
      d: reqUrl.searchParams.get('d') || '',
      refresh: reqUrl.searchParams.get('refresh') || '',
      playerId: reqUrl.searchParams.get('playerId') || '',
    };
    await actionHandler(req, res);
    return;
  }

  // GET /api/cached-dates  – returns dates that have per-date cache files on disk
  if (reqUrl.pathname === '/api/cached-dates') {
    const dates = await listCachedDates();
    console.log(`[cached-dates] found ${dates.length} cached date files`);
    sendJson(res, 200, { dates });
    return;
  }

  // GET /api/player-directory — cumulative directory of all players across all dates
  if (reqUrl.pathname === '/api/player-directory') {
    const cacheKey = 'player-directory';
    const cached = getCached(cacheKey);
    if (cached) {
      sendJson(res, 200, cached, { 'X-Cache': 'HIT' });
      return;
    }

    try {
      const dates = (await listCachedDates()).sort();
      const playerMap = new Map();

      for (const date of dates) {
        const disk = await loadDiskCacheForDate(date);
        if (!disk || !disk.allPlayers) continue;

        for (const p of disk.allPlayers) {
          const existing = playerMap.get(p.usabId);
          if (existing) {
            existing.latestName = p.name;
            if (!existing.nameSet.has(p.name)) {
              existing.nameSet.add(p.name);
            }
          } else {
            playerMap.set(p.usabId, {
              usabId: p.usabId,
              latestName: p.name,
              nameSet: new Set([p.name]),
            });
          }
        }
      }

      const directory = [...playerMap.values()]
        .map((entry) => {
          const names = [entry.latestName, ...[...entry.nameSet].filter((n) => n !== entry.latestName)];
          return { usabId: entry.usabId, name: entry.latestName, names };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(`[player-directory] ${directory.length} unique players across ${dates.length} dates`);
      setCache(cacheKey, directory);
      sendJson(res, 200, directory, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'player-directory' });
    }
    return;
  }

  // GET /api/all-players?date=2026-03-01
  if (reqUrl.pathname === '/api/all-players') {
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    if (!isValidDate(date)) {
      return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));
    }
    const cacheKey = `all-players:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      sendJson(res, 200, cached, { 'X-Cache': 'HIT', 'X-Partial': 'false' });
      return;
    }

    const perDateDisk = await getDiskCachedAllPlayers(date);
    if (perDateDisk) {
      console.log(`[all-players] serving from per-date disk cache for ${date}`);
      setCache(cacheKey, perDateDisk.players);
      sendJson(res, 200, perDateDisk.players, { 'X-Cache': 'DISK', 'X-Partial': 'false' });
      return;
    }

    const ageGroups = ['U11', 'U13', 'U15', 'U17', 'U19'];
    const eventTypes = ['BS', 'GS', 'BD', 'GD', 'XD'];
    const allPlayers = new Map();
    const rankingsByCategory = {};
    let fetchedFromWeb = false;
    const failedCategories = [];

    const tasks = [];
    for (const ag of ageGroups) {
      for (const et of eventTypes) {
        tasks.push({ ag, et });
      }
    }

    console.log(`[all-players] fetching ${tasks.length} ranking combinations…`);

    for (let i = 0; i < tasks.length; i += 5) {
      const batch = tasks.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async ({ ag, et }) => {
          const rankCacheKey = `rankings:${ag}:${et}:${date}`;
          const rankCached = getCached(rankCacheKey);
          if (rankCached) return { players: rankCached, ag, et, fromWeb: false };

          const url = `${USAB_BASE}/?age_group=${encodeURIComponent(ag)}&category=${encodeURIComponent(et)}&date=${encodeURIComponent(date)}`;
          const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          const players = parseRankings(html, ag, et);
          setCache(rankCacheKey, players);
          return { players, ag, et, fromWeb: true };
        }),
      );

      for (const [idx, result] of results.entries()) {
        if (result.status === 'fulfilled' && result.value) {
          const { players, ag, et, fromWeb } = result.value;
          if (fromWeb) fetchedFromWeb = true;
          const catKey = `${ag}-${et}`;
          rankingsByCategory[catKey] = players;
          for (const player of players) {
            if (!allPlayers.has(player.usabId)) {
              allPlayers.set(player.usabId, {
                usabId: player.usabId,
                name: player.name,
                entries: [],
              });
            }
            allPlayers.get(player.usabId).entries.push({
              ageGroup: player.ageGroup,
              eventType: player.eventType,
              rank: player.rank,
              rankingPoints: player.rankingPoints,
            });
          }
        } else {
          const failed = batch[idx];
          if (failed) failedCategories.push(`${failed.ag}-${failed.et}`);
        }
      }
    }

    const uniquePlayers = [...allPlayers.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    if (uniquePlayers.length > 0) {
      console.log(`[all-players] aggregated ${uniquePlayers.length} unique players`);
      setCache(cacheKey, uniquePlayers);

      if (fetchedFromWeb) {
        await saveDiskCache(date, rankingsByCategory, uniquePlayers);
      }

      const partial = failedCategories.length > 0;
      const headers = {
        'X-Cache': 'MISS',
        'X-Partial': partial ? 'true' : 'false',
      };
      if (partial) {
        headers['X-Failed-Categories'] = failedCategories.join(',');
      }
      sendJson(res, 200, uniquePlayers, headers);
    } else {
      const diskData = await getDiskCachedAllPlayers();
      if (diskData) {
        console.log(`[all-players] website returned no data, serving from disk cache (date ${diskData.date})`);
        sendJson(res, 200, diskData.players, { 'X-Cache': 'DISK', 'X-Partial': 'false' });
      } else {
        sendApiError(res, new UnavailableError('No data available'));
      }
    }
    return;
  }

  // GET /api/player/:id/tsw-stats or /api/player/:id/ranking-trend
  const playerActionMatch = reqUrl.pathname.match(/^\/api\/player\/(\d+)\/(tsw-stats|ranking-trend)$/);
  if (playerActionMatch) {
    const { default: actionHandler } = await import('./api/player/[id]/[action].js');
    req.query = { ...Object.fromEntries(reqUrl.searchParams), id: playerActionMatch[1], action: playerActionMatch[2] };
    await actionHandler(req, res);
    return;
  }

  // ── Serve static files from dist/ (production build) ─────────────────────
  const distDir = resolve(__dirname, 'dist');

  if (existsSync(distDir)) {
    const MIME_TYPES = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };

    const filePath = resolve(distDir, normalize(reqUrl.pathname === '/' ? 'index.html' : '.' + reqUrl.pathname));

    if (!filePath.startsWith(distDir)) {
      sendJson(res, 403, { error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        const mime = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
        const content = await readFile(filePath);
        res.setHeader('Content-Type', mime);
        res.writeHead(200);
        res.end(content);
        return;
      }
    } catch { /* file doesn't exist — fall through to SPA index */ }

    const indexPath = join(distDir, 'index.html');
    try {
      const content = await readFile(indexPath);
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(content);
      return;
    } catch { /* no index.html */ }
  }

    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  } catch (err) {
    if (res.writableEnded) {
      console.error('[api-server] uncaught error after response:', err);
      return;
    }
    sendApiError(res, err, { logLabel: 'api-server' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Rankings API  →  http://localhost:${PORT}\n`);
});
