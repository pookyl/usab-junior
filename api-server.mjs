/**
 * Lightweight proxy API server that fetches and parses data from
 * usabjrrankings.org and tournamentsoftware.com server-side,
 * avoiding any browser CORS/DOMParser issues.
 * Runs on port 3001 alongside the Vite dev server.
 */
import { createServer } from 'http';
import { URL } from 'url';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 3001;
const USAB_BASE = 'https://usabjrrankings.org';
const TSW_BASE = 'https://www.tournamentsoftware.com';
const TSW_ORG_CODE = 'C36A90FE-DFA8-414B-A8B6-F2BCF6B9B8BD'; // Badminton USA

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DISK_CACHE_DIR = join(__dirname, 'data');
const DISK_CACHE_FILE = join(DISK_CACHE_DIR, 'rankings-cache.json');

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Persistent disk cache ─────────────────────────────────────────────────────
// Per-date files: data/rankings-YYYY-MM-DD.json  (compact, allPlayers only)
//   Structure: { date, allPlayers: [...], savedAt }
// Legacy file:   data/rankings-cache.json  (pretty-printed, includes rankings)
//   Structure: { date, rankings: { "U11-BS": [...], ... }, allPlayers: [...], savedAt }

function diskCachePath(date) {
  return join(DISK_CACHE_DIR, `rankings-${date}.json`);
}

function listCachedDates() {
  try {
    if (!existsSync(DISK_CACHE_DIR)) return [];
    const files = readdirSync(DISK_CACHE_DIR);
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

function loadDiskCacheForDate(date) {
  try {
    const filePath = diskCachePath(date);
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.rankings && data.allPlayers) {
        data.rankings = rebuildRankingsFromPlayers(data.allPlayers);
      }
      console.log(`[disk-cache] loaded per-date cache for ${date} (saved ${data.savedAt})`);
      return data;
    }
  } catch (err) {
    console.warn(`[disk-cache] failed to load per-date cache for ${date}:`, err.message);
  }
  return null;
}

function loadDiskCache() {
  try {
    if (existsSync(DISK_CACHE_FILE)) {
      const raw = readFileSync(DISK_CACHE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      console.log(`[disk-cache] loaded cache for date ${data.date} (saved ${data.savedAt})`);
      return data;
    }
  } catch (err) {
    console.warn('[disk-cache] failed to load:', err.message);
  }
  return null;
}

function saveDiskCache(date, rankings, allPlayers) {
  try {
    if (!existsSync(DISK_CACHE_DIR)) mkdirSync(DISK_CACHE_DIR, { recursive: true });

    // Per-date file: compact JSON, allPlayers only (no rankings duplication)
    const perDateFile = diskCachePath(date);
    if (!existsSync(perDateFile)) {
      const lean = { date, allPlayers, savedAt: new Date().toISOString() };
      writeFileSync(perDateFile, JSON.stringify(lean));
      console.log(`[disk-cache] saved per-date cache for ${date} (${allPlayers.length} players, compact)`);
    }

    // Latest alias: pretty-printed with rankings (used by static frontend import)
    const full = { date, rankings, allPlayers, savedAt: new Date().toISOString() };
    writeFileSync(DISK_CACHE_FILE, JSON.stringify(full, null, 2));
    console.log(`[disk-cache] updated latest cache (rankings-cache.json) for ${date}`);
  } catch (err) {
    console.warn('[disk-cache] failed to save:', err.message);
  }
}

function getDiskCachedRankings(key, date) {
  const disk = date ? loadDiskCacheForDate(date) : loadDiskCache();
  if (disk && disk.rankings && disk.rankings[key]) return disk.rankings[key];
  return null;
}

function getDiskCachedAllPlayers(date) {
  const disk = date ? loadDiskCacheForDate(date) : loadDiskCache();
  if (disk && disk.allPlayers) return { players: disk.allPlayers, date: disk.date };
  return null;
}

function getDiskCachedDate() {
  const disk = loadDiskCache();
  return disk?.date ?? null;
}

// In-memory cache: key → { data, timestamp }
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── HTML entity decoder ──────────────────────────────────────────────────────
const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
function decodeHtmlEntities(str) {
  return str.replace(/&(#?\w+);/g, (m, code) => {
    if (ENTITY_MAP[code]) return ENTITY_MAP[code];
    if (code.startsWith('#x')) return String.fromCharCode(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCharCode(parseInt(code.slice(1), 10));
    return m;
  });
}

// ── Rankings HTML parser ──────────────────────────────────────────────────────
// Table structure:
//   <td>1</td>  <td>397901</td>  <td><a href="...">Name</a></td>  <td>6495</td>
function parseRankings(html, ageGroup, eventType) {
  const players = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return players;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      // Strip tags and trim whitespace
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' '));
    }
    if (cells.length < 4) continue;
    const rank = parseInt(cells[0], 10);
    const usabId = cells[1].trim();
    const name = decodeHtmlEntities(cells[2].trim());
    const pts = parseInt(cells[3].replace(/,/g, ''), 10);
    if (rank > 0 && usabId && name) {
      players.push({ usabId, name, rank, rankingPoints: pts, ageGroup, eventType });
    }
  }
  return players;
}

// ── Player detail HTML parser ─────────────────────────────────────────────────
// Each row:
//   <td class="tournament-link" data-tournament-id="58"
//       data-tournament-name="2025 YONEX U.S. JUNIOR..." ...></td>
//   <td>1</td>          ← position/place
//   <td>1701</td>       ← points
function parsePlayerGender(html) {
  const m = html.match(/<h4>\s*Gender\s*:\s*(\w+)\s*<\/h4>/i);
  return m ? m[1].trim() : null;
}

function parsePlayerDetail(html) {
  const entries = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Look for the tournament-link td with data attributes
    const tlMatch = rowHtml.match(
      /<td[^>]*class="[^"]*tournament-link[^"]*"[^>]*data-tournament-id="(\d+)"[^>]*data-tournament-name="([^"]+)"[^>]*data-tournament-location="([^"]*)"[^>]*>/i,
    );
    if (!tlMatch) continue;

    const tournamentId = tlMatch[1];
    const tournamentName = decodeHtmlEntities(tlMatch[2]);
    const location = decodeHtmlEntities(tlMatch[3]);

    // Extract remaining cells (position, points)
    const cells = [];
    const cellRegex = /<td(?![^>]*tournament-link)[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    const place = cells[0] ?? '';
    const pts = parseInt((cells[1] ?? '0').replace(/,/g, ''), 10);

    if (tournamentName && pts > 0) {
      entries.push({ tournamentName, location, tournamentId, place, points: pts });
    }
  }
  return entries;
}

// ── TSW cookie manager ────────────────────────────────────────────────────────
// TSW requires cookies accepted before serving content. We accept once, cache
// the cookie string, and send it with all subsequent TSW requests.
let tswCookies = '';

async function ensureTswCookies() {
  if (tswCookies) return;
  try {
    const resp = await fetch(`${TSW_BASE}/cookiewall/Save`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${TSW_BASE}/cookiewall`,
      },
      body: 'ReturnUrl=%2F&CookiePurposes=1&CookiePurposes=2&SettingsOpen=false',
      redirect: 'manual',
    });
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    tswCookies = setCookies.map((c) => c.split(';')[0]).join('; ');
    // Also set sport to badminton (sport=2)
    const sportResp = await fetch(
      `${TSW_BASE}/sportselection/setsportselection/2?returnUrl=%2F`,
      { headers: { ...BROWSER_HEADERS, Cookie: tswCookies }, redirect: 'manual' },
    );
    const sportCookies = sportResp.headers.getSetCookie?.() ?? [];
    if (sportCookies.length) {
      const existing = new Map(tswCookies.split('; ').map((c) => c.split('=')));
      for (const sc of sportCookies) {
        const [kv] = sc.split(';');
        const [k, ...rest] = kv.split('=');
        existing.set(k, rest.join('='));
      }
      tswCookies = [...existing].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    console.log('[tsw] cookies acquired');
  } catch (err) {
    console.error('[tsw] cookie setup failed:', err.message);
  }
}

async function tswFetch(path) {
  await ensureTswCookies();
  const url = `${TSW_BASE}${path}`;
  return fetch(url, {
    headers: { ...BROWSER_HEADERS, Cookie: tswCookies, 'X-Requested-With': 'XMLHttpRequest' },
  });
}

// ── TSW H2H HTML parser ──────────────────────────────────────────────────────
function parseH2HContent(html, headers) {
  const team1wins = parseInt(headers.get('team1wins') ?? '0', 10);
  const team2wins = parseInt(headers.get('team2wins') ?? '0', 10);

  // Parse summary stats from the comparison table
  const careerMatch = html.match(
    /<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>\s*<th[^>]*>[^<]*Career W-L[^<]*<\/th>\s*<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>/s,
  );
  const yearMatch = html.match(
    /<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>\s*<th[^>]*>[^<]*This year W-L[^<]*<\/th>\s*<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>/s,
  );

  // Parse individual matches
  const matches = [];
  const matchBlocks = html.split(/<div class="match">/g).slice(1);
  for (const block of matchBlocks) {
    // Header info: tournament, event, round
    const headerItems = [];
    const headerRegex =
      /<li class="match__header-title-item">[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/g;
    let hm;
    while ((hm = headerRegex.exec(block)) !== null) headerItems.push(hm[1].trim().replace(/&amp;/g, '&'));
    const tournament = headerItems[0] ?? '';
    const event = headerItems[1] ?? '';
    const round = headerItems[2] ?? '';

    const tournamentIdMatch = block.match(/\/sport\/player\.aspx\?id=([0-9A-Fa-f-]+)/);
    const tournamentUrl = tournamentIdMatch
      ? `/tournament/${tournamentIdMatch[1]}`
      : '';

    // Duration
    const durationMatch = block.match(/<time[^>]*>([\dhmHM\s]+)<\/time>/);
    const duration = durationMatch ? durationMatch[1].trim() : '';

    // Players: extract from match__row-title-value-content spans only
    const bodyMatch = block.match(/<div class="match__body">([\s\S]*?)<div class="match__result">/);
    const bodyHtml = bodyMatch ? bodyMatch[1] : '';
    const rowBlocks = bodyHtml.split(/<div class="match__row[\s"]/g).slice(1);
    const team1Won = (rowBlocks[0] ?? '').includes('has-won');
    const team2Won = (rowBlocks[1] ?? '').includes('has-won');

    function extractPlayers(rowHtml) {
      const names = [];
      const pRegex = /match__row-title-value-content[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/g;
      let pm;
      while ((pm = pRegex.exec(rowHtml)) !== null) names.push(pm[1].trim());
      return names;
    }

    const team1Players = extractPlayers(rowBlocks[0] ?? '');
    const team2Players = extractPlayers(rowBlocks[1] ?? '');

    // Scores: pairs of points in <ul class="points">
    const scores = [];
    const setRegex = /<ul class="points">([\s\S]*?)<\/ul>/g;
    let sm;
    while ((sm = setRegex.exec(block)) !== null) {
      const pts = [];
      const ptRegex = /<li class="points__cell[^"]*">\s*(\d+)/g;
      let ptm;
      while ((ptm = ptRegex.exec(sm[1])) !== null) pts.push(parseInt(ptm[1], 10));
      if (pts.length === 2) scores.push(pts);
    }

    // Footer: date and venue
    const dateMatch = block.match(
      /icon-clock[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/,
    );
    const venueMatch = block.match(
      /icon-marker[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/,
    );

    matches.push({
      tournament,
      tournamentUrl,
      event,
      round,
      duration,
      team1Players,
      team2Players,
      team1Won,
      team2Won,
      scores,
      date: dateMatch ? dateMatch[1].trim() : '',
      venue: venueMatch ? venueMatch[1].trim() : '',
    });
  }

  return {
    team1wins,
    team2wins,
    careerWL: {
      team1: careerMatch ? careerMatch[1].trim() : '',
      team2: careerMatch ? careerMatch[2].trim() : '',
    },
    yearWL: {
      team1: yearMatch ? yearMatch[1].trim() : '',
      team2: yearMatch ? yearMatch[2].trim() : '',
    },
    matches,
  };
}

// ── TSW USAB player profile URL builder ──────────────────────────────────────
function tswUsabProfilePath(usabId) {
  const encoded = Buffer.from('base64:' + usabId).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}`;
}

function tswUsabTournamentsPath(usabId) {
  const encoded = Buffer.from('base64:' + usabId).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}/tournaments/TournamentsPartial`;
}

function tswUsabOverviewPath(usabId) {
  const encoded = Buffer.from('base64:' + usabId).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}/OverviewPartial`;
}

// ── TSW Overview Statistics parser ──────────────────────────────────────────
function emptyWL() { return { wins: 0, losses: 0, total: 0, winPct: 0 }; }
function emptyCat() { return { career: emptyWL(), thisYear: emptyWL() }; }

function parseWLString(str) {
  const m = str.match(/(\d+)\s*\/\s*(\d+)\s*\((\d+)\)/);
  if (!m) return emptyWL();
  const wins = parseInt(m[1], 10);
  const losses = parseInt(m[2], 10);
  const total = parseInt(m[3], 10);
  return { wins, losses, total, winPct: total > 0 ? Math.round((wins / total) * 100) : 0 };
}

function parseTswOverviewStats(html) {
  const stats = {
    total: emptyCat(),
    singles: emptyCat(),
    doubles: emptyCat(),
    mixed: emptyCat(),
    recentHistory: [],
  };

  const tabMap = {
    tabStatsTotal: 'total',
    tabStatsSingles: 'singles',
    tabStatsDoubles: 'doubles',
    tabStatsMixed: 'mixed',
  };

  const tabIds = Object.keys(tabMap);
  for (let i = 0; i < tabIds.length; i++) {
    const tabId = tabIds[i];
    const catKey = tabMap[tabId];
    const tabStart = html.indexOf(`id="${tabId}"`);
    if (tabStart === -1) continue;

    // Find the end of this tab (start of next tab, or a far boundary)
    let tabEnd = html.length;
    for (let j = i + 1; j < tabIds.length; j++) {
      const nextIdx = html.indexOf(`id="${tabIds[j]}"`, tabStart + 1);
      if (nextIdx > -1) { tabEnd = nextIdx; break; }
    }
    const tabHtml = html.substring(tabStart, tabEnd);

    // Extract Career and This year W-L
    const wlRegex = /list__label">\s*([^<]+)[\s\S]*?list__value-start">\s*([\d]+\s*\/\s*[\d]+\s*\(\d+\))/g;
    let wlMatch;
    while ((wlMatch = wlRegex.exec(tabHtml)) !== null) {
      const label = wlMatch[1].trim().toLowerCase();
      const record = parseWLString(wlMatch[2]);
      if (label === 'career') stats[catKey].career = record;
      else if (label.includes('year')) stats[catKey].thisYear = record;
    }
  }

  // Parse recent history W/L indicators from Total tab
  const totalStart = html.indexOf('id="tabStatsTotal"');
  if (totalStart > -1) {
    const historyIdx = html.indexOf('History', totalStart);
    if (historyIdx > -1) {
      const histEnd = html.indexOf('</ul>', historyIdx);
      const histHtml = html.substring(historyIdx, histEnd > -1 ? histEnd : historyIdx + 2000);
      const tagRegex = /tag--(success|danger)[^"]*"[^>]*title="([^"]*)"/g;
      let hm;
      while ((hm = tagRegex.exec(histHtml)) !== null) {
        stats.recentHistory.push({ won: hm[1] === 'success', date: hm[2] });
      }
    }
  }

  return stats;
}

// ── TSW tournament history parser ────────────────────────────────────────────
function deriveCategoryFromEvent(eventName) {
  const ev = eventName.toLowerCase();
  if (ev.includes('xd') || ev.includes('mixed')) return 'mixed';
  if (ev.includes('bd') || ev.includes('gd') || ev.includes('doubles')) return 'doubles';
  return 'singles';
}

function parseTswTournaments(html, playerName) {
  const tournaments = [];
  const recentResults = [];

  // Split HTML by tournament media blocks (each <div class="media"> starts a tournament)
  const tournBlocks = html.split(/<div class="media">/g).slice(1);

  for (const tournBlock of tournBlocks) {
    // Tournament name
    const nameMatch = tournBlock.match(/media__link[^>]*>\s*<span class="nav-link__value">([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim().replace(/&amp;/g, '&');

    // Tournament URL
    const urlMatch = tournBlock.match(/href="(\/sport\/tournament\?id=[^"]+)"/);
    const url = urlMatch ? `https://www.tournamentsoftware.com${urlMatch[1].replace(/&amp;/g, '&')}` : '';

    // Dates
    const dateMatch = tournBlock.match(/<time[^>]*>([^<]+)<\/time>\s*(?:to\s*<time[^>]*>([^<]+)<\/time>)?/);
    const dates = dateMatch ? (dateMatch[2] ? `${dateMatch[1].trim()} - ${dateMatch[2].trim()}` : dateMatch[1].trim()) : '';

    // Location
    const locMatch = tournBlock.match(/icon-lang[^>]*\/>\s*([^<]+)/);
    const location = locMatch ? locMatch[1].trim().replace(/^\|\s*/, '') : '';

    // Parse events and their matches within this tournament
    const eventMap = new Map(); // eventName → { wins, losses }
    let currentEvent = '';

    const innerRegex = /module-divider__body[^>]*>\s*(?:Event:\s*)?([^<]+)|<div class="match">([\s\S]*?)(?=<div class="match">|<h[45] class="module-divider|<\/li>\s*<li class="module|$)/g;
    let im;
    while ((im = innerRegex.exec(tournBlock)) !== null) {
      if (im[1]) {
        const ev = im[1].trim();
        if (ev) currentEvent = ev;
        continue;
      }
      if (im[2] !== undefined) {
        const block = im[2];
        if (block.includes('>Bye<')) continue;

        const rowBlocks = block.split(/<div class="match__row[\s"]/g).slice(1);
        if (rowBlocks.length < 2) continue;

        const status1 = rowBlocks[0].match(/match__status">([WL])</);
        const status2 = rowBlocks[1].match(/match__status">([WL])</);
        const isWalkover = block.includes('>Walkover<');
        if (!status1 && !status2 && !isWalkover) continue;

        function extractNames(rowHtml) {
          const names = [];
          const re = /nav-link__value">([^<]+)<\/span><\/a>\s*<\/span>/g;
          let nm;
          while ((nm = re.exec(rowHtml)) !== null) names.push(nm[1].trim());
          return names;
        }
        const row1Names = extractNames(rowBlocks[0]);
        const row2Names = extractNames(rowBlocks[1]);

        let row1IsPlayer, playerWon;
        if (status1 || status2) {
          row1IsPlayer = !!status1;
          playerWon = status1 ? status1[1] === 'W' : status2[1] === 'W';
        } else {
          const pLower = playerName.toLowerCase();
          const row1HasPlayer = row1Names.some((n) => {
            const nLower = n.toLowerCase();
            return nLower.includes(pLower) || pLower.includes(nLower)
              || pLower.split(/\s+/).every((p) => nLower.includes(p));
          });
          row1IsPlayer = row1HasPlayer;
          const row1Won = rowBlocks[0].includes('has-won');
          playerWon = row1IsPlayer ? row1Won : !row1Won;
        }

        if (currentEvent) {
          if (!eventMap.has(currentEvent)) eventMap.set(currentEvent, { wins: 0, losses: 0 });
          const rec = eventMap.get(currentEvent);
          if (playerWon) rec.wins++;
          else rec.losses++;
        }

        const opponentNames = row1IsPlayer ? row2Names : row1Names;
        const teamNames = row1IsPlayer ? row1Names : row2Names;
        const nameParts = playerName.toLowerCase().split(/\s+/);
        const partnerNames = teamNames.filter((n) =>
          !nameParts.every((p) => new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(n)),
        );

        const category = deriveCategoryFromEvent(currentEvent);
        const roundMatch = block.match(/match__header-title-item[\s\S]*?nav-link__value">([^<]+)/);
        const round = roundMatch ? roundMatch[1].trim() : '';

        const scores = [];
        const setRegex = /<ul class="points">([\s\S]*?)<\/ul>/g;
        let sm;
        while ((sm = setRegex.exec(block)) !== null) {
          const pts = [];
          const ptRegex = /<li class="points__cell[^"]*">\s*(\d+)/g;
          let ptm;
          while ((ptm = ptRegex.exec(sm[1])) !== null) pts.push(parseInt(ptm[1], 10));
          if (pts.length === 2) scores.push(row1IsPlayer ? pts : [pts[1], pts[0]]);
        }

        const dateM = block.match(/icon-clock[\s\S]*?nav-link__value">([^<]+)/);

        recentResults.push({
          tournament: name,
          tournamentUrl: url,
          event: currentEvent,
          round,
          opponent: opponentNames.join(' / ') || 'Unknown',
          partner: partnerNames.join(' / '),
          category,
          score: isWalkover ? 'Walkover' : scores.map((s) => s.join('-')).join(', '),
          won: playerWon,
          date: dateM ? dateM[1].trim() : '',
          walkover: isWalkover || undefined,
        });
      }
    }

    const events = [...eventMap.entries()]
      .filter(([n]) => n.length > 0)
      .map(([n, wl]) => ({ name: n, category: deriveCategoryFromEvent(n), ...wl }));

    const tournamentMatches = recentResults.filter((r) => r.tournament === name);
    if (events.length > 0) {
      tournaments.push({ name, url, dates, location, events, matches: tournamentMatches });
    }
  }

  return { tournaments, recentResults };
}

// ── TSW player profile parser (legacy, kept for compatibility) ───────────────
function parseTswProfile(html, tswProfileUrl, playerName) {
  const stats = {
    tswProfileUrl,
    tswSearchUrl: '',
    totalMatches: 0,
    wins: 0,
    losses: 0,
    recentResults: [],
  };

  try {
    // The profile page groups matches under tournament media blocks.
    // Split by <div class="media"> to find tournament sections, then find
    // event headers (module-divider) and match blocks within each section.

    // First, build a mapping: for each match block position in the HTML,
    // track the most recent tournament name and event name seen before it.
    let currentTournament = '';
    let currentEvent = '';

    // Use a single pass: scan for tournament titles, event titles, and match blocks
    const tokenRegex =
      /media__link[^>]*>\s*<span class="nav-link__value">([^<]+)|module-divider__body[\s\S]*?nav-link__value">([^<]+)|<div class="match">([\s\S]*?)(?=<div class="match">|<div class="media">|<\/ol>|$)/g;

    let token;
    while ((token = tokenRegex.exec(html)) !== null) {
      if (token[1]) {
        // Tournament name (skip if it matches the player's own name)
        const name = token[1].trim();
        if (!name.toLowerCase().includes(playerName.split(' ')[0].toLowerCase()) ||
            name.includes('CHAMPIONSHIP') || name.includes('OPEN') || name.includes('TOURNAMENT')) {
          currentTournament = name;
        }
        continue;
      }
      if (token[2]) {
        currentEvent = token[2].trim();
        continue;
      }
      if (token[3] !== undefined) {
        const block = token[3];

        // Skip byes
        if (block.includes('>Bye<')) continue;

        // Round from header
        const roundMatch = block.match(
          /match__header-title-item[\s\S]*?nav-link__value">([^<]+)/,
        );
        const round = roundMatch ? roundMatch[1].trim() : '';

        // Extract player rows
        const rowBlocks = block.split(/<div class="match__row[\s"]/g).slice(1);
        if (rowBlocks.length < 2) continue;

        function extractNames(rowHtml) {
          const names = [];
          const re = /nav-link__value">([^<]+)<\/span><\/a>\s*<\/span>/g;
          let m;
          while ((m = re.exec(rowHtml)) !== null) names.push(m[1].trim());
          return names;
        }

        const row1Names = extractNames(rowBlocks[0]);
        const row2Names = extractNames(rowBlocks[1]);

        // TSW marks the viewed player's row with a match__status tag (W or L)
        const status1 = rowBlocks[0].match(/match__status">([WL])</);
        const status2 = rowBlocks[1].match(/match__status">([WL])</);
        const row1IsPlayer = !!status1;
        const playerWon = status1 ? status1[1] === 'W' : status2 ? status2[1] === 'W' : false;

        if (!status1 && !status2) continue;

        const opponentNames = row1IsPlayer ? row2Names : row1Names;
        const teamNames = row1IsPlayer ? row1Names : row2Names;

        // Extract partner (teammates other than the viewed player)
        const nameParts = playerName.toLowerCase().split(/\s+/);
        const partnerNames = teamNames.filter((n) =>
          !nameParts.every((p) => new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(n)),
        );

        // Derive category from event name (e.g. "BS U13", "BD U11", "XD U11")
        const evLower = currentEvent.toLowerCase();
        let category = 'singles';
        if (evLower.includes('xd') || evLower.includes('mixed')) category = 'mixed';
        else if (evLower.includes('bd') || evLower.includes('gd') || evLower.includes('doubles')) category = 'doubles';

        // Scores (HTML lists row1 score first; reorder so player's score is first)
        const scores = [];
        const setRegex = /<ul class="points">([\s\S]*?)<\/ul>/g;
        let sm;
        while ((sm = setRegex.exec(block)) !== null) {
          const pts = [];
          const ptRegex = /<li class="points__cell[^"]*">\s*(\d+)/g;
          let ptm;
          while ((ptm = ptRegex.exec(sm[1])) !== null) pts.push(parseInt(ptm[1], 10));
          if (pts.length === 2) {
            scores.push(row1IsPlayer ? pts : [pts[1], pts[0]]);
          }
        }
        const scoreStr = scores.map((s) => s.join('-')).join(', ');

        // Date
        const dateMatch = block.match(
          /icon-clock[\s\S]*?nav-link__value">([^<]+)/,
        );

        stats.totalMatches++;
        if (playerWon) stats.wins++;
        else stats.losses++;

        stats.recentResults.push({
          tournament: currentTournament,
          event: currentEvent,
          round,
          opponent: opponentNames.join(' / ') || 'Unknown',
          partner: partnerNames.join(' / '),
          category,
          score: scoreStr,
          won: playerWon,
          date: dateMatch ? dateMatch[1].trim() : '',
        });
      }
    }
  } catch (parseErr) {
    console.error('[tsw-stats] profile parse error:', parseErr.message);
  }

  console.log(
    `[tsw-stats] parsed ${stats.totalMatches} matches (${stats.wins}W ${stats.losses}L)`,
  );
  return stats;
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

  // GET /api/rankings?age_group=U13&category=BS&date=2026-03-01
  if (reqUrl.pathname === '/api/rankings') {
    const ageGroup = reqUrl.searchParams.get('age_group') ?? 'U11';
    const eventType = reqUrl.searchParams.get('category') ?? 'BS';
    const date = reqUrl.searchParams.get('date') ?? '2026-03-01';
    const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    // Check per-date disk cache first
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
      const url = `${USAB_BASE}/?age_group=${ageGroup}&category=${eventType}&date=${date}`;
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
    const date = reqUrl.searchParams.get('date') ?? '2026-03-01';
    const cacheKey = `player:${usabId}:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const url = `${USAB_BASE}/${usabId}/details?age_group=${ageGroup}&category=${eventType}&date=${date}`;
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
      const path = `/head-2-head/Head2HeadContent?OrganizationCode=${TSW_ORG_CODE}&t1p1memberid=${p1}&t2p1memberid=${p2}`;
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

  // GET /api/cached-dates  – returns dates that have per-date cache files on disk
  if (reqUrl.pathname === '/api/cached-dates') {
    const dates = listCachedDates();
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

      // Parse the <option> values from the "As Of Date" dropdown
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
      const dates = listCachedDates().sort();
      const playerMap = new Map();

      for (const date of dates) {
        const disk = loadDiskCacheForDate(date);
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
    const date = reqUrl.searchParams.get('date') ?? '2026-03-01';
    const cacheKey = `all-players:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    // Check per-date disk cache first (serves historical dates without scraping)
    const perDateDisk = getDiskCachedAllPlayers(date);
    if (perDateDisk) {
      console.log(`[all-players] serving from per-date disk cache for ${date}`);
      setCache(cacheKey, perDateDisk.players);
      res.writeHead(200, { 'X-Cache': 'DISK' });
      res.end(JSON.stringify(perDateDisk.players));
      return;
    }

    // No per-date cache — fetch live from USAB (only happens for uncached dates)
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

          const url = `${USAB_BASE}/?age_group=${ag}&category=${et}&date=${date}`;
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
        saveDiskCache(date, rankingsByCategory, uniquePlayers);
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
      const dates = listCachedDates().sort();
      const trend = [];
      let playerName = '';

      for (const date of dates) {
        const disk = loadDiskCacheForDate(date);
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

      // Fetch OverviewPartial and TournamentsPartial in parallel
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

      // Parse the TournamentsPartial to get match results + tournaments for the most recent year,
      // and extract available year tabs for fetching older years.
      const tournamentsByYear = {};
      let recentResults = [];

      if (tournamentsResp.ok) {
        const tournamentsHtml = await tournamentsResp.text();

        // Extract available year tabs
        const yearRegex = /data-tabid="(\d{4})"/g;
        const years = [];
        let ym;
        while ((ym = yearRegex.exec(tournamentsHtml)) !== null) years.push(parseInt(ym[1]));

        // Parse current year from TournamentsPartial
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
      setCache(cacheKey, fallback);
      res.writeHead(200);
      res.end(JSON.stringify(fallback));
    }
    return;
  }

  // ── Serve static files from dist/ (production build) ─────────────────────
  const distDir = join(__dirname, 'dist');

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

    const filePath = join(distDir, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const mime = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.writeHead(200);
      res.end(readFileSync(filePath));
      return;
    }

    // SPA fallback: serve index.html for client-side routes
    const indexPath = join(distDir, 'index.html');
    if (existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(readFileSync(indexPath));
      return;
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n  Rankings API  →  http://localhost:${PORT}\n`);
});
