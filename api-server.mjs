/**
 * Lightweight proxy API server that fetches and parses data from
 * usabjrrankings.org and tournamentsoftware.com server-side,
 * avoiding any browser CORS/DOMParser issues.
 * Runs on port 3001 alongside the Vite dev server.
 */
import { createServer } from 'http';
import { URL } from 'url';
import { readFile, writeFile, stat, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';

import {
  USAB_BASE, TSW_BASE, TSW_ORG_CODE, BROWSER_HEADERS,
  getCached, setCache,
  parseRankings, parsePlayerGender, parsePlayerDetail,
  parseH2HContent, parseTswOverviewStats, parseTswTournaments,
  parseTswDrawsList, parseTswTournamentInfo,
  tswFetch, tswUsabProfilePath, tswUsabTournamentsPath, tswUsabOverviewPath,
  emptyCat,
} from './api/_lib/shared.js';

const PORT = process.env.PORT || 3001;
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DISK_CACHE_DIR = join(__dirname, 'data');
const DISK_CACHE_FILE = join(DISK_CACHE_DIR, 'rankings-cache.json');

// ── Persistent disk cache (synchronous for local dev server) ──────────────────
function diskCachePath(date) {
  return join(DISK_CACHE_DIR, `rankings-${date}.json`);
}

async function listCachedDates() {
  try {
    if (!existsSync(DISK_CACHE_DIR)) return [];
    const files = await readdir(DISK_CACHE_DIR);
    const dates = [];
    for (const f of files) {
      const m = f.match(/^rankings-(\d{4}-\d{2}-\d{2})\.json$/);
      if (m) dates.push(m[1]);
    }
    return dates.sort().reverse();
  } catch {
    return [];
  }
}

function rebuildRankingsFromPlayers(allPlayers) {
  const rankings = {};
  for (const player of allPlayers) {
    for (const e of player.entries) {
      const key = `${e.ageGroup}-${e.eventType}`;
      if (!rankings[key]) rankings[key] = [];
      rankings[key].push({
        usabId: player.usabId,
        name: player.name,
        rank: e.rank,
        rankingPoints: e.rankingPoints,
        ageGroup: e.ageGroup,
        eventType: e.eventType,
      });
    }
  }
  for (const key of Object.keys(rankings)) {
    rankings[key].sort((a, b) => a.rank - b.rank);
  }
  return rankings;
}

async function loadDiskCacheForDate(date) {
  try {
    const filePath = diskCachePath(date);
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.rankings && data.allPlayers) {
      data.rankings = rebuildRankingsFromPlayers(data.allPlayers);
    }
    console.log(`[disk-cache] loaded per-date cache for ${date} (saved ${data.savedAt})`);
    return data;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[disk-cache] failed to load per-date cache for ${date}:`, err.message);
  }
  return null;
}

async function loadDiskCache() {
  try {
    const raw = await readFile(DISK_CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    console.log(`[disk-cache] loaded cache for date ${data.date} (saved ${data.savedAt})`);
    return data;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[disk-cache] failed to load:', err.message);
  }
  return null;
}

async function saveDiskCache(date, rankings, allPlayers) {
  try {
    await mkdir(DISK_CACHE_DIR, { recursive: true });

    const perDateFile = diskCachePath(date);
    try {
      await stat(perDateFile);
    } catch {
      const lean = { date, allPlayers, savedAt: new Date().toISOString() };
      await writeFile(perDateFile, JSON.stringify(lean));
      console.log(`[disk-cache] saved per-date cache for ${date} (${allPlayers.length} players, compact)`);
    }

    const full = { date, rankings, allPlayers, savedAt: new Date().toISOString() };
    await writeFile(DISK_CACHE_FILE, JSON.stringify(full, null, 2));
    console.log(`[disk-cache] updated latest cache (rankings-cache.json) for ${date}`);
  } catch (err) {
    console.warn('[disk-cache] failed to save:', err.message);
  }
}

async function getDiskCachedRankings(key, date) {
  const disk = date ? await loadDiskCacheForDate(date) : await loadDiskCache();
  if (disk?.rankings?.[key]) return disk.rankings[key];
  return null;
}

async function getDiskCachedAllPlayers(date) {
  const disk = date ? await loadDiskCacheForDate(date) : await loadDiskCache();
  if (disk?.allPlayers) return { players: disk.allPlayers, date: disk.date };
  return null;
}

async function getDiskCachedDate() {
  const disk = await loadDiskCache();
  return disk?.date ?? null;
}

async function getDefaultDate() {
  const dates = await listCachedDates();
  return dates[0] ?? null;
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

  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const defaultDate = await getDefaultDate();

  // GET /api/rankings?age_group=U13&category=BS&date=2026-03-01
  if (reqUrl.pathname === '/api/rankings') {
    const ageGroup = reqUrl.searchParams.get('age_group') ?? 'U11';
    const eventType = reqUrl.searchParams.get('category') ?? 'BS';
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const diskKey = `${ageGroup}-${eventType}`;
    const perDateDisk = getDiskCachedRankings(diskKey, date);
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
      const response = await fetch(url, { headers: BROWSER_HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const players = parseRankings(html, ageGroup, eventType);
      console.log(`[rankings] parsed ${players.length} players for ${ageGroup} ${eventType}`);
      setCache(cacheKey, players);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(players));
    } catch (err) {
      console.error(`[rankings] error:`, err.message);
      const diskData = getDiskCachedRankings(diskKey);
      if (diskData) {
        console.log(`[rankings] serving from disk cache for ${diskKey}`);
        res.writeHead(200, { 'X-Cache': 'DISK' });
        res.end(JSON.stringify(diskData));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
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
      const response = await fetch(url, { headers: BROWSER_HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const history = parsePlayerDetail(html);
      const gender = parsePlayerGender(html);
      console.log(`[player] parsed ${history.length} tournament entries for USAB ${usabId}, gender=${gender}`);
      const result = { gender, entries: history };
      setCache(cacheKey, result);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error(`[player] error:`, err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/h2h?player1=446477&player2=530254
  if (reqUrl.pathname === '/api/h2h') {
    const p1 = reqUrl.searchParams.get('player1');
    const p2 = reqUrl.searchParams.get('player2');
    if (!p1 || !p2) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'player1 and player2 query params required' }));
      return;
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
      if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
      const html = await resp.text();
      const data = parseH2HContent(html, resp.headers);
      console.log(`[h2h] parsed ${data.matches.length} matches, score ${data.team1wins}-${data.team2wins}`);
      setCache(cacheKey, data);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('[h2h] error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/tournaments?season=2025-2026
  if (reqUrl.pathname === '/api/tournaments') {
    const season = reqUrl.searchParams.get('season');
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
        res.writeHead(200);
        res.end(JSON.stringify({ seasons: {}, availableSeasons: [] }));
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      function recomputeStatuses(tournaments) {
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

      async function loadSeason(s) {
        try {
          const raw = await readFile(join(tournamentDir, `tournaments-${s}.json`), 'utf-8');
          return JSON.parse(raw);
        } catch { return null; }
      }

      let result;
      if (season) {
        const data = await loadSeason(season);
        result = {
          season,
          tournaments: data ? recomputeStatuses(data.tournaments) : [],
          availableSeasons,
        };
      } else {
        const allSeasons = {};
        for (const s of availableSeasons) {
          const data = await loadSeason(s);
          if (data) allSeasons[s] = { tournaments: recomputeStatuses(data.tournaments) };
        }
        result = { seasons: allSeasons, availableSeasons };
      }

      setCache(cacheKey, result);
      console.log(`[tournaments] serving ${season || 'all'} (${availableSeasons.length} seasons available)`);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[tournaments] error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/tournaments/:tswId/medals — tournament medal results
  const tournamentMedalsMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/medals$/);
  if (tournamentMedalsMatch) {
    const { default: medalsHandler } = await import('./api/tournaments/[tswId]/medals.js');
    req.query = { tswId: tournamentMedalsMatch[1] };
    await medalsHandler(req, res);
    return;
  }

  // GET /api/tournaments/:tswId/events
  const tournamentEventsMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/events$/);
  if (tournamentEventsMatch) {
    const { default: eventsHandler } = await import('./api/tournaments/[tswId]/events.js');
    req.query = { tswId: tournamentEventsMatch[1] };
    await eventsHandler(req, res);
    return;
  }

  // GET /api/tournaments/:tswId/players
  const tournamentPlayersMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/players$/);
  if (tournamentPlayersMatch) {
    const { default: playersHandler } = await import('./api/tournaments/[tswId]/players.js');
    req.query = { tswId: tournamentPlayersMatch[1] };
    await playersHandler(req, res);
    return;
  }

  // GET /api/tournaments/:tswId/seeding
  const tournamentSeedingMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/seeding$/);
  if (tournamentSeedingMatch) {
    const { default: seedingHandler } = await import('./api/tournaments/[tswId]/seeding.js');
    req.query = { tswId: tournamentSeedingMatch[1] };
    await seedingHandler(req, res);
    return;
  }

  // GET /api/tournaments/:tswId/winners
  const tournamentWinnersMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/winners$/);
  if (tournamentWinnersMatch) {
    const { default: winnersHandler } = await import('./api/tournaments/[tswId]/winners.js');
    req.query = { tswId: tournamentWinnersMatch[1] };
    await winnersHandler(req, res);
    return;
  }

  // GET /api/tournaments/:tswId/matches
  const tournamentMatchesMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/matches$/);
  if (tournamentMatchesMatch) {
    const { default: matchesHandler } = await import('./api/tournaments/[tswId]/matches.js');
    req.query = { tswId: tournamentMatchesMatch[1], d: reqUrl.searchParams.get('d') || '' };
    await matchesHandler(req, res);
    return;
  }

  // GET /api/tournaments/:tswId — on-demand tournament detail from TSW
  const tournamentDetailMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)$/);
  if (tournamentDetailMatch) {
    const tswId = tournamentDetailMatch[1];
    const cacheKey = `tournament-detail:${tswId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const drawsPath = `/sport/draws.aspx?id=${encodeURIComponent(tswId)}`;
      console.log(`[tournament-detail] fetching ${TSW_BASE}${drawsPath}`);
      const resp = await tswFetch(drawsPath);
      if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
      const html = await resp.text();

      const info = parseTswTournamentInfo(html);
      const draws = parseTswDrawsList(html);

      const result = {
        tswId,
        name: info.name,
        dates: info.dates,
        location: info.location,
        draws,
        tswUrl: `https://www.tournamentsoftware.com/tournament/${tswId}`,
      };

      console.log(`[tournament-detail] ${tswId}: "${info.name}", ${draws.length} draws`);
      setCache(cacheKey, result);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[tournament-detail] error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/cached-dates  – returns dates that have per-date cache files on disk
  if (reqUrl.pathname === '/api/cached-dates') {
    const dates = await listCachedDates();
    console.log(`[cached-dates] found ${dates.length} cached date files`);
    res.writeHead(200);
    res.end(JSON.stringify({ dates }));
    return;
  }

  // GET /api/latest-date  – scrapes the USAB homepage for the most recent "As Of" date
  if (reqUrl.pathname === '/api/latest-date') {
    const cacheKey = 'latest-date';
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      console.log('[latest-date] fetching USAB homepage…');
      const response = await fetch(USAB_BASE, { headers: BROWSER_HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();

      const dates = [];
      const optionRegex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
      let om;
      while ((om = optionRegex.exec(html)) !== null) {
        const val = om[1].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) dates.push(val);
      }

      const latestDate = dates.length > 0 ? dates[0] : null;
      console.log(`[latest-date] found ${dates.length} dates, latest: ${latestDate}`);
      const result = { latestDate, availableDates: dates };
      setCache(cacheKey, result);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[latest-date] error:', err.message);
      const diskDate = getDiskCachedDate();
      if (diskDate) {
        console.log(`[latest-date] website unreachable, using disk-cached date: ${diskDate}`);
        const result = { latestDate: diskDate, availableDates: [diskDate] };
        res.writeHead(200, { 'X-Cache': 'DISK' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // GET /api/player-directory — cumulative directory of all players across all dates
  if (reqUrl.pathname === '/api/player-directory') {
    const cacheKey = 'player-directory';
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
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
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(directory));
    } catch (err) {
      console.error('[player-directory] error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/all-players?date=2026-03-01
  if (reqUrl.pathname === '/api/all-players') {
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    const cacheKey = `all-players:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const perDateDisk = getDiskCachedAllPlayers(date);
    if (perDateDisk) {
      console.log(`[all-players] serving from per-date disk cache for ${date}`);
      setCache(cacheKey, perDateDisk.players);
      res.writeHead(200, { 'X-Cache': 'DISK' });
      res.end(JSON.stringify(perDateDisk.players));
      return;
    }

    const ageGroups = ['U11', 'U13', 'U15', 'U17', 'U19'];
    const eventTypes = ['BS', 'GS', 'BD', 'GD', 'XD'];
    const allPlayers = new Map();
    const rankingsByCategory = {};
    let fetchedFromWeb = false;

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
          const response = await fetch(url, { headers: BROWSER_HEADERS });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          const players = parseRankings(html, ag, et);
          setCache(rankCacheKey, players);
          return { players, ag, et, fromWeb: true };
        }),
      );

      for (const result of results) {
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

      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(uniquePlayers));
    } else {
      const diskData = getDiskCachedAllPlayers();
      if (diskData) {
        console.log(`[all-players] website returned no data, serving from disk cache (date ${diskData.date})`);
        res.writeHead(200, { 'X-Cache': 'DISK' });
        res.end(JSON.stringify(diskData.players));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      }
    }
    return;
  }

  // GET /api/player/:id/ranking-trend — historical rank & points across all cached dates
  const trendMatch = reqUrl.pathname.match(/^\/api\/player\/(\d+)\/ranking-trend$/);
  if (trendMatch) {
    const usabId = trendMatch[1];
    const cacheKey = `trend:${usabId}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const dates = (await listCachedDates()).sort();
      const trend = [];
      let playerName = '';

      for (const date of dates) {
        const disk = await loadDiskCacheForDate(date);
        if (!disk || !disk.allPlayers) continue;
        const player = disk.allPlayers.find((p) => p.usabId === usabId);
        if (!player) continue;
        if (!playerName && player.name) playerName = player.name;
        trend.push({ date, entries: player.entries });
      }

      const result = { usabId, name: playerName, trend };
      setCache(cacheKey, result);
      console.log(`[ranking-trend] ${usabId} → ${trend.length} data points across ${dates.length} dates`);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[ranking-trend] error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/player/:id/tsw-stats?name=PLAYER_NAME
  const tswStatsMatch = reqUrl.pathname.match(/^\/api\/player\/(\d+)\/tsw-stats$/);
  if (tswStatsMatch) {
    const usabId = tswStatsMatch[1];
    const playerName = reqUrl.searchParams.get('name') ?? '';
    const cacheKey = `tsw-stats:${usabId}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const profilePath = tswUsabProfilePath(usabId);
    const tswProfileUrl = `${TSW_BASE}${profilePath}`;
    const tswSearchLink = `${TSW_BASE}/find/player?q=${encodeURIComponent(playerName)}`;
    const fallback = {
      tswProfileUrl,
      tswSearchUrl: tswSearchLink,
      total: emptyCat(),
      singles: emptyCat(),
      doubles: emptyCat(),
      mixed: emptyCat(),
      recentHistory: [],
      recentResults: [],
      tournamentsByYear: {},
    };

    try {
      console.log(`[tsw-stats] fetching overview + tournaments for "${playerName}" (${usabId})`);

      const encoded = Buffer.from('base64:' + usabId).toString('base64');
      const encodedNoPad = encoded.replace(/=+$/, '');

      const [overviewResp, tournamentsResp] = await Promise.all([
        tswFetch(tswUsabOverviewPath(usabId)),
        tswFetch(tswUsabTournamentsPath(usabId)),
      ]);

      let overviewStats = { total: emptyCat(), singles: emptyCat(), doubles: emptyCat(), mixed: emptyCat(), recentHistory: [] };
      if (overviewResp.ok) {
        const overviewHtml = await overviewResp.text();
        overviewStats = parseTswOverviewStats(overviewHtml);
        console.log(`[tsw-stats] overview: career ${overviewStats.total.career.wins}W/${overviewStats.total.career.losses}L`);
      } else {
        console.warn(`[tsw-stats] overview fetch failed: HTTP ${overviewResp.status}`);
      }

      const tournamentsByYear = {};
      let recentResults = [];

      if (tournamentsResp.ok) {
        const tournamentsHtml = await tournamentsResp.text();

        const yearRegex = /data-tabid="(\d{4})"/g;
        const years = [];
        let ym;
        while ((ym = yearRegex.exec(tournamentsHtml)) !== null) years.push(parseInt(ym[1]));

        const currentYearData = parseTswTournaments(tournamentsHtml, playerName);
        recentResults = currentYearData.recentResults;
        if (years[0] && currentYearData.tournaments.length > 0) {
          tournamentsByYear[years[0]] = currentYearData.tournaments;
        }
        console.log(`[tsw-stats] year ${years[0]}: ${currentYearData.tournaments.length} tournaments, ${recentResults.length} matches`);

        const olderYears = years.slice(1);
        if (olderYears.length > 0) {
          const olderResults = await Promise.allSettled(
            olderYears.map(async (year) => {
              const path = `/player/${TSW_ORG_CODE}/${encodeURIComponent(encoded)}/tournaments/GetPlayerTournamentsByYear?AOrganizationCode=${TSW_ORG_CODE}&AMemberID=${encodedNoPad}&Year=${year}&IncludeOlderTournaments=False`;
              const resp = await tswFetch(path);
              if (!resp.ok) return { year, tournaments: [], results: [] };
              const html = await resp.text();
              const data = parseTswTournaments(html, playerName);
              return { year, tournaments: data.tournaments, results: data.recentResults };
            }),
          );

          for (const r of olderResults) {
            if (r.status === 'fulfilled') {
              if (r.value.tournaments.length > 0) {
                tournamentsByYear[r.value.year] = r.value.tournaments;
                console.log(`[tsw-stats] year ${r.value.year}: ${r.value.tournaments.length} tournaments`);
              }
              if (r.value.results.length > 0) {
                recentResults = recentResults.concat(r.value.results);
              }
            }
          }
        }

        const olderTabMatch = tournamentsHtml.match(/data-href="([^"]+)"[^>]*data-tabid="older"/);
        if (olderTabMatch) {
          try {
            const olderPath = olderTabMatch[1].replace(/&amp;/g, '&');
            const olderResp = await tswFetch(olderPath);
            if (olderResp.ok) {
              const olderHtml = await olderResp.text();
              const olderData = parseTswTournaments(olderHtml, playerName);
              for (const t of olderData.tournaments) {
                const ym = t.dates.match(/(\d{4})/);
                if (ym) {
                  const y = parseInt(ym[1]);
                  if (!tournamentsByYear[y]) tournamentsByYear[y] = [];
                  tournamentsByYear[y].push(t);
                }
              }
              if (olderData.recentResults.length > 0) {
                recentResults = recentResults.concat(olderData.recentResults);
              }
              console.log(`[tsw-stats] older tab: ${olderData.tournaments.length} tournaments, ${olderData.recentResults.length} matches`);
            }
          } catch (_) { /* older tab fetch is best-effort */ }
        }
      }

      const stats = {
        tswProfileUrl,
        tswSearchUrl: tswSearchLink,
        ...overviewStats,
        recentResults,
        tournamentsByYear,
      };

      setCache(cacheKey, stats);
      res.writeHead(200, { 'X-Cache': 'MISS' });
      res.end(JSON.stringify(stats));
    } catch (err) {
      console.error('[tsw-stats] error:', err.message);
      res.writeHead(200);
      res.end(JSON.stringify(fallback));
    }
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
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Forbidden' }));
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n  Rankings API  →  http://localhost:${PORT}\n`);
});
