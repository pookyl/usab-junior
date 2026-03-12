#!/usr/bin/env node
/**
 * Patches per-season tournament cache files by searching TSW for completed
 * tournaments that are missing a tswId. Uses fuzzy name + date matching.
 *
 * Usage:
 *   node scripts/patch-tournaments-tsw.mjs                     # patch all seasons
 *   node scripts/patch-tournaments-tsw.mjs --season 2019-2020  # single season
 *   node scripts/patch-tournaments-tsw.mjs --dry-run           # show matches without writing
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

const TSW_BASE = 'https://www.tournamentsoftware.com';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── TSW cookie wall ──────────────────────────────────────────────────────────

let tswCookies = null;

async function ensureTswCookies() {
  if (tswCookies) return;
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
  tswCookies = (resp.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
  const sportResp = await fetch(
    `${TSW_BASE}/sportselection/setsportselection/2?returnUrl=%2F`,
    { headers: { ...BROWSER_HEADERS, Cookie: tswCookies }, redirect: 'manual' },
  );
  const sportCookies = sportResp.headers.getSetCookie?.() ?? [];
  if (sportCookies.length) {
    const existing = new Map(tswCookies.split('; ').map(c => c.split('=')));
    for (const sc of sportCookies) {
      const [kv] = sc.split(';');
      const [k, ...rest] = kv.split('=');
      existing.set(k, rest.join('='));
    }
    tswCookies = [...existing].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

// ── TSW search ───────────────────────────────────────────────────────────────

async function tswSearch(query, maxPages = 3) {
  await ensureTswCookies();
  const all = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const body = new URLSearchParams({
      'TournamentFilter.Q': query,
      'TournamentFilter.DateFilterType': '0',
      'TournamentExtendedFilter.SportID': '2',
      'Page': String(page),
    });
    const resp = await fetch(`${TSW_BASE}/find/tournament/DoSearch`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: tswCookies,
        Referer: `${TSW_BASE}/find`,
      },
      body: body.toString(),
    });
    const html = await resp.text();

    let count = 0;
    // Extract tournament ID + name
    const nameRe = /href="\/sport\/tournament\?id=([0-9A-Fa-f-]+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi;
    let m;
    while ((m = nameRe.exec(html)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);

      const entry = {
        id: m[1].toUpperCase(),
        name: decodeEntities(m[2].trim()),
        startDate: null,
        endDate: null,
        location: null,
      };

      all.push(entry);
      count++;
    }

    // Extract dates and locations from the card metadata
    // Cards follow pattern: <a href="/sport/tournament?id=GUID"...>name</a> ... date ... location
    const cardRe = /href="\/sport\/tournament\?id=([0-9A-Fa-f-]+)"[\s\S]*?(?=href="\/sport\/tournament\?id=|<nav|$)/gi;
    while ((m = cardRe.exec(html)) !== null) {
      const id = m[1].toUpperCase();
      const card = m[0];
      const entry = all.find(e => e.id === id);
      if (!entry) continue;

      const dateMatch = card.match(/icon-calendar[\s\S]*?<time[^>]*datetime="([^"]+)"[\s\S]*?<time[^>]*datetime="([^"]+)"/i);
      if (dateMatch) {
        entry.startDate = dateMatch[1].slice(0, 10);
        entry.endDate = dateMatch[2].slice(0, 10);
      }

      const locMatch = card.match(/icon-marker[\s\S]*?<span[^>]*>([^<]+)/i);
      if (locMatch) entry.location = locMatch[1].trim();
    }

    if (count === 0) break;
    if (page < maxPages) await sleep(200);
  }

  return all;
}

// ── Matching logic ───────────────────────────────────────────────────────────

const NOISE_WORDS = new Set([
  'open', 'local', 'championships', 'championship', 'regional', 'closed',
  'junior', 'juniors', 'jr', 'badminton', 'tournament', 'yonex',
  'usab', 'usa', 'u.s.', 'u.s', 'us', '#1', '#2', '#3', 'the', 'and', '&',
  'for', 'of',
]);

function tokenize(name) {
  return name
    .toLowerCase()
    .replace(/[().,\-–&]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

// Region abbreviation aliases for both search and matching
const REGION_ALIASES = {
  ne: ['northeast', 'new england', 'ne'],
  nw: ['northwest', 'nw'],
  socal: ['socal', 'southern california', 'so cal'],
  norcal: ['norcal', 'northern california', 'nor cal'],
  mw: ['midwest', 'mw'],
  south: ['south', 'southern'],
};

function significantTokens(name) {
  return tokenize(name).filter(w => !NOISE_WORDS.has(w) && !/^\d{4}$/.test(w));
}

function expandedTokens(name) {
  const tokens = significantTokens(name);
  const expanded = new Set(tokens);
  for (const t of tokens) {
    const aliases = REGION_ALIASES[t];
    if (aliases) for (const a of aliases) expanded.add(a);
  }
  return expanded;
}

function extractYear(name) {
  const m = name.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : null;
}

function dateOverlapDays(t, candidate) {
  if (!t.startDate || !candidate.startDate) return -1;
  const tStart = new Date(t.startDate);
  const tEnd = new Date(t.endDate || t.startDate);
  const cStart = new Date(candidate.startDate);
  const cEnd = new Date(candidate.endDate || candidate.startDate);

  const overlapStart = Math.max(tStart.getTime(), cStart.getTime());
  const overlapEnd = Math.min(tEnd.getTime(), cEnd.getTime());
  return Math.max(0, (overlapEnd - overlapStart) / 86400000 + 1);
}

function dateDiffDays(t, candidate) {
  if (!t.startDate || !candidate.startDate) return Infinity;
  return Math.abs(new Date(t.startDate) - new Date(candidate.startDate)) / 86400000;
}

// Reject candidates that are clearly non-US
const NON_US_MARKERS = [
  'mongolia', 'scottish', 'scotland', 'england', 'denmark', 'india', 'indonesia',
  'malaysia', 'china', 'chinese', 'japan', 'korea', 'thai', 'thailand', 'vietnam',
  'french', 'france', 'german', 'germany', 'dutch', 'netherlands', 'africa', 'african',
  'australia', 'new zealand', 'canada', 'canadian', 'mexico', 'brazil', 'peruttu',
  'zambia', 'finland', 'finnish', 'swedish', 'sweden', 'norway', 'norwegian',
  'irish', 'ireland', 'european', 'asian', 'oceania', 'pan american',
  'las vegas world chinese',
];

function looksNonUS(candidate) {
  const lower = (candidate.name + ' ' + (candidate.location || '')).toLowerCase();
  return NON_US_MARKERS.some(marker => lower.includes(marker));
}

function scoreMatch(tournament, candidate) {
  if (looksNonUS(candidate)) return -1;

  let score = 0;

  const tYear = extractYear(tournament.name);
  const cYear = extractYear(candidate.name);
  if (tYear && cYear && tYear !== cYear) return -1;

  // Token overlap with region alias expansion
  const tTokens = significantTokens(tournament.name);
  const tExpanded = expandedTokens(tournament.name);
  const cExpanded = expandedTokens(candidate.name);
  const matched = tTokens.filter(w => {
    if (cExpanded.has(w)) return true;
    const aliases = REGION_ALIASES[w];
    if (aliases) return aliases.some(a => cExpanded.has(a));
    return false;
  });
  const tokenRatio = tTokens.length > 0 ? matched.length / tTokens.length : 0;

  if (matched.length === 0 && tTokens.length > 0) return -1;

  // Date overlap
  const overlap = dateOverlapDays(tournament, candidate);
  if (overlap > 0) {
    score += 50 + overlap * 10;
  } else if (tournament.startDate && candidate.startDate) {
    const diff = dateDiffDays(tournament, candidate);
    if (diff <= 3) score += 40;
    else if (diff <= 7) score += 20;
    else if (diff <= 30) score += 5;
    else return -1;
  }

  score += tokenRatio * 30;

  // Region/hostClub in candidate name
  const cNameLower = candidate.name.toLowerCase();
  if (tournament.region) {
    const regionKey = tournament.region.toLowerCase();
    const aliases = REGION_ALIASES[regionKey] || [regionKey];
    if (aliases.some(a => cNameLower.includes(a))) score += 5;
  }
  if (tournament.hostClub) {
    const clubTokens = tokenize(tournament.hostClub).filter(w => w.length > 2);
    const clubMatches = clubTokens.filter(w => cNameLower.includes(w));
    if (clubTokens.length > 0) score += (clubMatches.length / clubTokens.length) * 10;
  }

  // Type keyword bonus
  const typeMap = { ORC: 'regional', OLC: 'local', CRC: 'closed', National: 'national', Selection: 'selection' };
  const typeKeyword = typeMap[tournament.type];
  if (typeKeyword && cNameLower.includes(typeKeyword)) score += 5;

  return score;
}

function buildSearchQueries(tournament) {
  const queries = [];
  const name = tournament.name;
  const year = extractYear(name);
  const sigTokens = significantTokens(name);

  // Full name (trimmed)
  queries.push(name.replace(/#\d+/g, '').trim());

  // Year + significant tokens (top 3-4)
  if (year && sigTokens.length > 0) {
    const top = sigTokens.slice(0, 4).join(' ');
    queries.push(`${year} ${top}`);
  }

  // Year + hostClub
  if (year && tournament.hostClub) {
    const club = tournament.hostClub.split(/\s+/).slice(0, 2).join(' ');
    queries.push(`${year} ${club} junior`);
  }

  // Year + region + type
  if (year && tournament.region) {
    queries.push(`${year} ${tournament.region} junior`);
  }

  // Deduplicate
  const seen = new Set();
  return queries.filter(q => {
    const key = q.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#8211': '–', '#8217': "'" };
function decodeEntities(str) {
  return str.replace(/&(#?\w+);/g, (m, code) => {
    if (ENTITY_MAP[code]) return ENTITY_MAP[code];
    if (code.startsWith('#x')) return String.fromCharCode(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCharCode(parseInt(code.slice(1), 10));
    return m;
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const seasonFlag = args.includes('--season') ? args[args.indexOf('--season') + 1] : null;
  const dryRun = args.includes('--dry-run');
  const minScore = 45; // Require reasonable confidence

  // Discover season files
  const files = readdirSync(DATA_DIR)
    .filter(f => /^tournaments-\d{4}-\d{4}\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    console.log('[patch] no tournament cache files found in data/');
    return;
  }

  // Collect IDs already assigned to avoid duplicates
  const usedTswIds = new Set();
  const allData = {};
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'));
    allData[f] = data;
    for (const t of data.tournaments) {
      if (t.tswId) usedTswIds.add(t.tswId);
    }
  }

  console.log(`[patch] ${usedTswIds.size} existing TSW IDs across all seasons`);

  let totalPatched = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;

  for (const f of files) {
    const data = allData[f];
    const season = data.season;

    if (seasonFlag && season !== seasonFlag) continue;

    const missing = data.tournaments.filter(t =>
      !t.tswId
      && t.status === 'completed'
      && t.startDate
      && !t.name.toLowerCase().includes('cancelled')
      && t.name !== 'TOURNAMENT NAME'
    );

    if (missing.length === 0) {
      console.log(`[${season}] no missing tournaments to patch`);
      continue;
    }

    console.log(`\n[${season}] ${missing.length} completed tournaments missing TSW IDs`);
    let patched = 0;

    for (const tournament of missing) {
      const queries = buildSearchQueries(tournament);
      let bestMatch = null;
      let bestScore = -1;
      const candidates = new Map(); // id → entry

      for (const query of queries) {
        const results = await tswSearch(query, 2);
        for (const r of results) {
          if (!candidates.has(r.id)) candidates.set(r.id, r);
        }
        await sleep(300);
      }

      // Score all candidates
      for (const candidate of candidates.values()) {
        if (usedTswIds.has(candidate.id)) continue;
        const score = scoreMatch(tournament, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      if (bestMatch && bestScore >= minScore) {
        const tswUrl = `https://www.tournamentsoftware.com/tournament/${bestMatch.id}`;
        console.log(`  ✓ ${tournament.name}`);
        console.log(`    → ${bestMatch.name} (score: ${bestScore.toFixed(0)})`);
        console.log(`    → ${tswUrl}`);
        if (tournament.startDate && bestMatch.startDate) {
          console.log(`    dates: ${tournament.startDate} vs ${bestMatch.startDate}`);
        }

        if (!dryRun) {
          tournament.tswId = bestMatch.id;
          tournament.tswUrl = tswUrl;
          usedTswIds.add(bestMatch.id);
        }
        patched++;
      } else if (bestMatch && bestScore >= 20) {
        console.log(`  ? ${tournament.name}`);
        console.log(`    ~ ${bestMatch.name} (score: ${bestScore.toFixed(0)}) — too low, skipping`);
        totalSkipped++;
      } else {
        console.log(`  ✗ ${tournament.name} — no match found (${candidates.size} candidates)`);
        totalNotFound++;
      }
    }

    if (patched > 0 && !dryRun) {
      data.savedAt = new Date().toISOString();
      writeFileSync(join(DATA_DIR, f), JSON.stringify(data, null, 2));
      console.log(`  → wrote ${f} (${patched} patched)`);
    }

    totalPatched += patched;
  }

  console.log(`\n[patch] done: ${totalPatched} patched, ${totalSkipped} low-confidence, ${totalNotFound} not found`);
  if (dryRun) console.log('[patch] (dry-run mode — no files were modified)');
}

main().catch((err) => {
  console.error('[patch] fatal error:', err);
  process.exit(1);
});
