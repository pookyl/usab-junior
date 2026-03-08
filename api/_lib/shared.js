import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── Constants ────────────────────────────────────────────────────────────────
export const USAB_BASE = 'https://usabjrrankings.org';
export const TSW_BASE = 'https://www.tournamentsoftware.com';
export const TSW_ORG_CODE = 'C36A90FE-DFA8-414B-A8B6-F2BCF6B9B8BD';

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── In-memory cache (persists across warm invocations) ───────────────────────
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  return null;
}

export function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── Disk cache (bundled read-only fallback for Vercel) ───────────────────────
const DISK_CACHE_FILE = join(process.cwd(), 'data', 'rankings-cache.json');

export function loadDiskCache() {
  try {
    if (existsSync(DISK_CACHE_FILE)) {
      return JSON.parse(readFileSync(DISK_CACHE_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

export function getDiskCachedRankings(key) {
  const disk = loadDiskCache();
  if (disk?.rankings?.[key]) return disk.rankings[key];
  return null;
}

export function getDiskCachedAllPlayers() {
  const disk = loadDiskCache();
  if (disk?.allPlayers) return { players: disk.allPlayers, date: disk.date };
  return null;
}

export function getDiskCachedDate() {
  return loadDiskCache()?.date ?? null;
}

// ── CORS helper ──────────────────────────────────────────────────────────────
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

// ── Rankings HTML parser ─────────────────────────────────────────────────────
export function parseRankings(html, ageGroup, eventType) {
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
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' '));
    }
    if (cells.length < 4) continue;
    const rank = parseInt(cells[0], 10);
    const usabId = cells[1].trim();
    const name = cells[2].trim();
    const pts = parseInt(cells[3].replace(/,/g, ''), 10);
    if (rank > 0 && usabId && name) {
      players.push({ usabId, name, rank, rankingPoints: pts, ageGroup, eventType });
    }
  }
  return players;
}

// ── Player detail HTML parser ────────────────────────────────────────────────
export function parsePlayerGender(html) {
  const m = html.match(/<h4>\s*Gender\s*:\s*(\w+)\s*<\/h4>/i);
  return m ? m[1].trim() : null;
}

export function parsePlayerDetail(html) {
  const entries = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const tlMatch = rowHtml.match(
      /<td[^>]*class="[^"]*tournament-link[^"]*"[^>]*data-tournament-id="(\d+)"[^>]*data-tournament-name="([^"]+)"[^>]*data-tournament-location="([^"]*)"[^>]*>/i,
    );
    if (!tlMatch) continue;

    const tournamentId = tlMatch[1];
    const tournamentName = tlMatch[2];
    const location = tlMatch[3];

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

// ── H2H HTML parser ──────────────────────────────────────────────────────────
export function parseH2HContent(html, headers) {
  const team1wins = parseInt(headers.get('team1wins') ?? '0', 10);
  const team2wins = parseInt(headers.get('team2wins') ?? '0', 10);

  const careerMatch = html.match(
    /<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>\s*<th[^>]*>[^<]*Career W-L[^<]*<\/th>\s*<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>/s,
  );
  const yearMatch = html.match(
    /<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>\s*<th[^>]*>[^<]*This year W-L[^<]*<\/th>\s*<td[^>]*>\s*([\d]+-[\d]+\s*\(\d+\))\s*<\/td>/s,
  );

  const matches = [];
  const matchBlocks = html.split(/<div class="match">/g).slice(1);
  for (const block of matchBlocks) {
    const headerItems = [];
    const headerRegex =
      /<li class="match__header-title-item">[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/g;
    let hm;
    while ((hm = headerRegex.exec(block)) !== null) headerItems.push(hm[1].trim());
    const tournament = headerItems[0] ?? '';
    const event = headerItems[1] ?? '';
    const round = headerItems[2] ?? '';

    const tournamentIdMatch = block.match(/\/sport\/player\.aspx\?id=([0-9A-Fa-f-]+)/);
    const tournamentUrl = tournamentIdMatch
      ? `/sport/tournament.aspx?id=${tournamentIdMatch[1]}`
      : '';

    const durationMatch = block.match(/<time[^>]*>([\dhmHM\s]+)<\/time>/);
    const duration = durationMatch ? durationMatch[1].trim() : '';

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

    const dateMatch = block.match(/icon-clock[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/);
    const venueMatch = block.match(/icon-marker[\s\S]*?<span class="nav-link__value">([^<]+)<\/span>/);

    matches.push({
      tournament, tournamentUrl, event, round, duration,
      team1Players, team2Players, team1Won, team2Won, scores,
      date: dateMatch ? dateMatch[1].trim() : '',
      venue: venueMatch ? venueMatch[1].trim() : '',
    });
  }

  return {
    team1wins, team2wins,
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

// ── TSW cookie manager ───────────────────────────────────────────────────────
let tswCookies = '';

export async function ensureTswCookies() {
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
  } catch (err) {
    console.error('[tsw] cookie setup failed:', err.message);
  }
}

export async function tswFetch(path) {
  await ensureTswCookies();
  const url = `${TSW_BASE}${path}`;
  return fetch(url, {
    headers: { ...BROWSER_HEADERS, Cookie: tswCookies, 'X-Requested-With': 'XMLHttpRequest' },
  });
}

// ── TSW URL builders ─────────────────────────────────────────────────────────
export function tswUsabProfilePath(usabId) {
  const encoded = Buffer.from('base64:' + usabId).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}`;
}

export function tswUsabTournamentsPath(usabId) {
  const encoded = Buffer.from('base64:' + usabId).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}/tournaments/TournamentsPartial`;
}

export function tswUsabOverviewPath(usabId) {
  const encoded = Buffer.from('base64:' + usabId).toString('base64');
  return `/player/${TSW_ORG_CODE}/${encoded}/OverviewPartial`;
}

// ── TSW Overview Statistics parser ───────────────────────────────────────────
export function emptyWL() { return { wins: 0, losses: 0, total: 0, winPct: 0 }; }
export function emptyCat() { return { career: emptyWL(), thisYear: emptyWL() }; }

function parseWLString(str) {
  const m = str.match(/(\d+)\s*\/\s*(\d+)\s*\((\d+)\)/);
  if (!m) return emptyWL();
  const wins = parseInt(m[1], 10);
  const losses = parseInt(m[2], 10);
  const total = parseInt(m[3], 10);
  return { wins, losses, total, winPct: total > 0 ? Math.round((wins / total) * 100) : 0 };
}

export function parseTswOverviewStats(html) {
  const stats = {
    total: emptyCat(), singles: emptyCat(),
    doubles: emptyCat(), mixed: emptyCat(),
    recentHistory: [],
  };

  const tabMap = {
    tabStatsTotal: 'total', tabStatsSingles: 'singles',
    tabStatsDoubles: 'doubles', tabStatsMixed: 'mixed',
  };

  const tabIds = Object.keys(tabMap);
  for (let i = 0; i < tabIds.length; i++) {
    const tabId = tabIds[i];
    const catKey = tabMap[tabId];
    const tabStart = html.indexOf(`id="${tabId}"`);
    if (tabStart === -1) continue;

    let tabEnd = html.length;
    for (let j = i + 1; j < tabIds.length; j++) {
      const nextIdx = html.indexOf(`id="${tabIds[j]}"`, tabStart + 1);
      if (nextIdx > -1) { tabEnd = nextIdx; break; }
    }
    const tabHtml = html.substring(tabStart, tabEnd);

    const wlRegex = /list__label">\s*([^<]+)[\s\S]*?list__value-start">\s*([\d]+\s*\/\s*[\d]+\s*\(\d+\))/g;
    let wlMatch;
    while ((wlMatch = wlRegex.exec(tabHtml)) !== null) {
      const label = wlMatch[1].trim().toLowerCase();
      const record = parseWLString(wlMatch[2]);
      if (label === 'career') stats[catKey].career = record;
      else if (label.includes('year')) stats[catKey].thisYear = record;
    }
  }

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
export function deriveCategoryFromEvent(eventName) {
  const ev = eventName.toLowerCase();
  if (ev.includes('xd') || ev.includes('mixed')) return 'mixed';
  if (ev.includes('bd') || ev.includes('gd') || ev.includes('doubles')) return 'doubles';
  return 'singles';
}

export function parseTswTournaments(html, playerName) {
  const tournaments = [];
  const recentResults = [];

  const tournBlocks = html.split(/<div class="media">/g).slice(1);

  for (const tournBlock of tournBlocks) {
    const nameMatch = tournBlock.match(/media__link[^>]*>\s*<span class="nav-link__value">([^<]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim().replace(/&amp;/g, '&');

    const urlMatch = tournBlock.match(/href="(\/sport\/tournament\?id=[^"]+)"/);
    const url = urlMatch ? `https://www.tournamentsoftware.com${urlMatch[1].replace(/&amp;/g, '&')}` : '';

    const dateMatch = tournBlock.match(/<time[^>]*>([^<]+)<\/time>\s*(?:to\s*<time[^>]*>([^<]+)<\/time>)?/);
    const dates = dateMatch ? (dateMatch[2] ? `${dateMatch[1].trim()} - ${dateMatch[2].trim()}` : dateMatch[1].trim()) : '';

    const locMatch = tournBlock.match(/icon-lang[^>]*\/>\s*([^<]+)/);
    const location = locMatch ? locMatch[1].trim().replace(/^\|\s*/, '') : '';

    const eventMap = new Map();
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
        if (!status1 && !status2) continue;
        const row1IsPlayer = !!status1;
        const playerWon = status1 ? status1[1] === 'W' : status2[1] === 'W';

        if (currentEvent) {
          if (!eventMap.has(currentEvent)) eventMap.set(currentEvent, { wins: 0, losses: 0 });
          const rec = eventMap.get(currentEvent);
          if (playerWon) rec.wins++;
          else rec.losses++;
        }

        function extractNames(rowHtml) {
          const names = [];
          const re = /nav-link__value">([^<]+)<\/span><\/a>\s*<\/span>/g;
          let nm;
          while ((nm = re.exec(rowHtml)) !== null) names.push(nm[1].trim());
          return names;
        }
        const row1Names = extractNames(rowBlocks[0]);
        const row2Names = extractNames(rowBlocks[1]);
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
          tournament: name, event: currentEvent, round,
          opponent: opponentNames.join(' / ') || 'Unknown',
          partner: partnerNames.join(' / '),
          category,
          score: scores.map((s) => s.join('-')).join(', '),
          won: playerWon,
          date: dateM ? dateM[1].trim() : '',
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
