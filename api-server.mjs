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
      const diskData = await getDiskCachedRankings(diskKey);
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

  // GET /api/tournaments/:tswId/:action — unified tournament action dispatcher
  const tournamentActionMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/([a-z]+)$/);
  if (tournamentActionMatch) {
    const { default: actionHandler } = await import('./api/tournaments/[tswId]/[action].js');
    req.query = {
      tswId: tournamentActionMatch[1],
      action: tournamentActionMatch[2],
      d: reqUrl.searchParams.get('d') || '',
      refresh: reqUrl.searchParams.get('refresh') || '',
    };
    await actionHandler(req, res);
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

    const perDateDisk = await getDiskCachedAllPlayers(date);
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
      const diskData = await getDiskCachedAllPlayers();
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
