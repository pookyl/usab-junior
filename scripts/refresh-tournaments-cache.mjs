#!/usr/bin/env node
/**
 * Scrapes the USAB Junior Tournament Schedule page, extracts tournament
 * info and TSW IDs, and writes per-season cache files:
 *   data/tournaments-2025-2026.json
 *   data/tournaments-2024-2025.json
 *   ...
 *
 * Past seasons (all tournaments completed) are only scraped once — if the
 * file already exists it is skipped. The current season is always refreshed.
 *
 * Usage:
 *   node scripts/refresh-tournaments-cache.mjs                  # current + previous season
 *   node scripts/refresh-tournaments-cache.mjs --season 2025-2026  # single season (force)
 *   node scripts/refresh-tournaments-cache.mjs --all            # all seasons on the page
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

process.chdir(ROOT);
const {
  tswFetch,
  parseTswTournamentPlayers,
  TSW_BASE,
} = await import('../api/_lib/shared.js');

const TSW_DETAILS_BATCH_SIZE = Math.max(1, Number(process.env.TSW_DETAILS_BATCH_SIZE ?? 3));
const TSW_DETAILS_BATCH_DELAY_MS = Math.max(0, Number(process.env.TSW_DETAILS_BATCH_DELAY_MS ?? 500));

const USAB_SCHEDULE_URL = 'https://usabadminton.org/athletes/juniors/junior-tournament-schedule/';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function seasonCachePath(season) {
  return join(DATA_DIR, `tournaments-${season}.json`);
}

// ── HTML entity decoder ──────────────────────────────────────────────────────
const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#8211': '–', '#8217': "'" };
function decodeHtmlEntities(str) {
  return str.replace(/&(#?\w+);/g, (m, code) => {
    if (ENTITY_MAP[code]) return ENTITY_MAP[code];
    if (code.startsWith('#x')) return String.fromCharCode(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCharCode(parseInt(code.slice(1), 10));
    return m;
  });
}

function stripHtml(html) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '').trim()).replace(/\s+/g, ' ');
}

// ── Date parsing ─────────────────────────────────────────────────────────────

function parseUSABDateRange(raw) {
  const cleaned = stripHtml(raw).replace(/Rescheduled\s*/i, '').trim();
  if (/^TBA$/i.test(cleaned)) return { startDate: null, endDate: null };

  const rangeMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[–\-]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (rangeMatch) {
    return {
      startDate: toISODate(rangeMatch[1], rangeMatch[2], rangeMatch[3]),
      endDate: toISODate(rangeMatch[4], rangeMatch[5], rangeMatch[6]),
    };
  }

  const singleMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (singleMatch) {
    const d = toISODate(singleMatch[1], singleMatch[2], singleMatch[3]);
    return { startDate: d, endDate: d };
  }

  return { startDate: null, endDate: null };
}

function toISODate(month, day, year) {
  let y = parseInt(year, 10);
  if (y < 100) y += 2000;
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function computeStatus(startDate, endDate) {
  if (!startDate) return 'upcoming';
  const today = new Date().toISOString().slice(0, 10);
  if (today > endDate) return 'completed';
  if (today >= startDate) return 'in-progress';
  return 'upcoming';
}

function isSeasonFullyCompleted(tournaments) {
  return tournaments.length > 0 && tournaments.every(t => computeStatus(t.startDate, t.endDate) === 'completed');
}

// ── Extract TSW GUID from a URL ──────────────────────────────────────────────

function extractTswId(url) {
  if (!url) return null;
  const m = url.match(/(?:\/tournament\/|[?&]id=)([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/i);
  return m ? m[1].toUpperCase() : null;
}

// ── Normalize tournament type ────────────────────────────────────────────────

function normalizeTournamentType(raw) {
  const t = raw.trim().toLowerCase();
  if (t.includes('national')) return 'National';
  if (t.includes('selection')) return 'Selection';
  if (t === 'orc') return 'ORC';
  if (t === 'olc') return 'OLC';
  if (t === 'crc') return 'CRC';
  if (t === 'jdt') return 'JDT';
  return raw.trim();
}

// ── Normalize region names ───────────────────────────────────────────────────

const REGION_ALIASES = {
  midwest: 'MW',
};

function normalizeRegion(raw) {
  const trimmed = raw.trim();
  return REGION_ALIASES[trimmed.toLowerCase()] || trimmed;
}

// ── Parse the USAB schedule page ─────────────────────────────────────────────

function parseSchedulePage(html) {
  const seasons = {};

  const tabTitleRegex = /elementor-tab-title\s+elementor-tab-desktop-title[^>]*data-tab="(\d+)"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi;
  const tabMap = {};
  let tm;
  while ((tm = tabTitleRegex.exec(html)) !== null) {
    tabMap[tm[1]] = tm[2].trim();
  }

  const tabContentRegex = /id="elementor-tab-content-\d+"\s+class="elementor-tab-content[^"]*"\s+data-tab="(\d+)"[^>]*>([\s\S]*?)(?=<div\s+(?:class="elementor-tab-title|id="elementor-tab-content)|\s*<\/div>\s*<\/div>\s*<\/div>)/gi;
  let cm;
  while ((cm = tabContentRegex.exec(html)) !== null) {
    const season = tabMap[cm[1]];
    if (!season || seasons[season]) continue;

    const tournaments = parseSeasonTable(cm[2]);
    if (tournaments.length > 0) {
      seasons[season] = { tournaments };
      console.log(`  ${season}: ${tournaments.length} tournaments`);
    }
  }

  return seasons;
}

function parseSeasonTable(html) {
  const tournaments = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return tournaments;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length < 5) continue;

    const { startDate, endDate } = parseUSABDateRange(cells[0]);
    const nameHtml = cells[1];
    const name = stripHtml(nameHtml);
    const nameLink = nameHtml.match(/<a[^>]+href="([^"]+)"[^>]*>/i);
    let usabUrl = null, tswId = null, tswUrl = null;

    if (nameLink) {
      const href = decodeHtmlEntities(nameLink[1]);
      if (href.includes('tournamentsoftware.com')) {
        tswId = extractTswId(href);
        tswUrl = href;
      } else if (href.includes('usabadminton.org')) {
        usabUrl = href;
      }
    }

    const region = normalizeRegion(stripHtml(cells[2]) || 'National');
    const hostClub = stripHtml(cells[3]);
    const type = normalizeTournamentType(stripHtml(cells[4]));

    let prospectusUrl = null;
    if (cells[5]) {
      const prospLink = cells[5].match(/<a[^>]+href="([^"]+\.pdf)"[^>]*>/i);
      if (prospLink) prospectusUrl = decodeHtmlEntities(prospLink[1]);
    }

    const status = computeStatus(startDate, endDate);

    if (name && !name.toLowerCase().includes('date') && name !== 'TOURNAMENT NAME') {
      tournaments.push({
        name, startDate, endDate, region, hostClub, type,
        tswId, tswUrl, usabUrl, prospectusUrl, status,
        totalPlayers: null, venueClub: null, venueLocation: null,
      });
    }
  }

  return tournaments;
}

// ── Fetch TSW IDs from USAB blog posts ───────────────────────────────────────

async function enrichWithTswIds(tournaments) {
  const toFetch = tournaments.filter(t => !t.tswId && t.usabUrl);
  if (toFetch.length === 0) return;

  console.log(`[tsw-ids] fetching ${toFetch.length} USAB blog posts for TSW IDs…`);

  for (let i = 0; i < toFetch.length; i += 3) {
    const batch = toFetch.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(async (tournament) => {
        const resp = await fetch(tournament.usabUrl, {
          headers: BROWSER_HEADERS,
          redirect: 'follow',
        });
        if (!resp.ok) return null;
        const html = await resp.text();
        const tswMatch = html.match(/href="([^"]*tournamentsoftware\.com[^"]*)"/i);
        if (tswMatch) {
          const url = decodeHtmlEntities(tswMatch[1]);
          const id = extractTswId(url);
          if (id) {
            tournament.tswId = id;
            tournament.tswUrl = url;
            console.log(`  ✓ ${tournament.name} → ${id}`);
            return id;
          }
        }
        return null;
      }),
    );

    const found = results.filter(r => r.status === 'fulfilled' && r.value).length;
    if (found === 0 && batch.length > 0) {
      console.log(`  (batch ${Math.floor(i / 3) + 1}: no TSW links found)`);
    }

    if (i + 3 < toFetch.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── Fetch venue info and total players from TSW ──────────────────────────────

function parseTswVenueInfo(html) {
  const venueTitleMatch = html.match(/module__title-main">\s*Venue\s*</);
  if (!venueTitleMatch) return { venueClub: null, venueLocation: null };

  const venueSection = html.substring(venueTitleMatch.index, venueTitleMatch.index + 3000);

  const clubMatch = venueSection.match(/media__title[\s\S]*?nav-link__value">([^<]+)/);
  const venueClub = clubMatch ? decodeHtmlEntities(clubMatch[1].trim()) : null;

  const streetMatch = venueSection.match(/p-street-address[^>]*>([\s\S]*?)<\/div>/);
  const postalMatch = venueSection.match(/p-postal-code[^>]*>([^<]+)/);
  const localityMatch = venueSection.match(/p-locality[^>]*>([^<]+)/);
  const regionMatch = venueSection.match(/p-region[^>]*>([^<]+)/);
  const countryMatch = venueSection.match(/p-country-name[^>]*>([^<]+)/);

  const street = streetMatch
    ? decodeHtmlEntities(streetMatch[1].replace(/<br\s*\/?>/gi, ',').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim())
    : null;
  const city = localityMatch ? decodeHtmlEntities(localityMatch[1].trim()) : null;
  const state = regionMatch ? decodeHtmlEntities(regionMatch[1].trim()) : null;
  const postalCode = postalMatch ? decodeHtmlEntities(postalMatch[1].trim()) : null;
  const country = countryMatch ? decodeHtmlEntities(countryMatch[1].trim()) : null;

  const addressParts = [];
  if (street) addressParts.push(street);
  if (city && state && postalCode) addressParts.push(`${city}, ${state} ${postalCode}`);
  else if (city && state) addressParts.push(`${city}, ${state}`);
  else if (city) addressParts.push(city);
  if (country) addressParts.push(country);

  const venueLocation = addressParts.length > 0 ? addressParts.join(', ') : null;

  return { venueClub, venueLocation };
}

async function enrichWithTswDetails(tournaments) {
  const toFetch = tournaments.filter(t => t.tswId && t.totalPlayers == null);
  if (toFetch.length === 0) return;

  console.log(`[tsw-details] fetching venue & player info for ${toFetch.length} tournaments…`);

  for (let i = 0; i < toFetch.length; i += TSW_DETAILS_BATCH_SIZE) {
    const batch = toFetch.slice(i, i + TSW_DETAILS_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (tournament) => {
        try {
          const tswId = tournament.tswId;

          const [mainResp, playersResp] = await Promise.all([
            tswFetch(`/tournament/${tswId}`),
            tswFetch(`/tournament/${tswId.toLowerCase()}/Players/GetPlayersContent`, {
              method: 'POST',
              extraHeaders: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: `${TSW_BASE}/tournament/${tswId}/players`,
              },
              body: '',
            }),
          ]);

          if (mainResp.ok) {
            const mainHtml = await mainResp.text();
            const venueInfo = parseTswVenueInfo(mainHtml);
            tournament.venueClub = venueInfo.venueClub;
            tournament.venueLocation = venueInfo.venueLocation;
          }

          if (playersResp.ok) {
            const playersHtml = await playersResp.text();
            const playersMap = parseTswTournamentPlayers(playersHtml);
            tournament.totalPlayers = playersMap.size > 0 ? playersMap.size : null;
          }

          console.log(`  ✓ ${tournament.name}: ${tournament.totalPlayers ?? '?'} players, venue: ${tournament.venueClub || 'N/A'} (${tournament.venueLocation || 'N/A'})`);
        } catch (err) {
          console.log(`  ✗ ${tournament.name}: ${err.message}`);
        }
      }),
    );

    if (i + TSW_DETAILS_BATCH_SIZE < toFetch.length && TSW_DETAILS_BATCH_DELAY_MS > 0) {
      await new Promise(r => setTimeout(r, TSW_DETAILS_BATCH_DELAY_MS));
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const forceSeason = args.find(a => /^\d{4}-\d{4}$/.test(a))
    || (args.includes('--season') && args[args.indexOf('--season') + 1]);
  const allSeasons = args.includes('--all');

  console.log('[tournaments] fetching USAB schedule page…');
  const response = await fetch(USAB_SCHEDULE_URL, { headers: BROWSER_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  console.log(`[tournaments] fetched ${(html.length / 1024).toFixed(0)} KB`);

  let seasons = parseSchedulePage(html);

  if (forceSeason) {
    if (!seasons[forceSeason]) {
      console.error(`[tournaments] season ${forceSeason} not found. Available: ${Object.keys(seasons).join(', ')}`);
      process.exit(1);
    }
    seasons = { [forceSeason]: seasons[forceSeason] };
  } else if (!allSeasons) {
    const keys = Object.keys(seasons).sort().reverse();
    const keep = keys.slice(0, 1);
    const filtered = {};
    for (const k of keep) filtered[k] = seasons[k];
    seasons = filtered;
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;

  for (const [season, data] of Object.entries(seasons)) {
    const filePath = seasonCachePath(season);
    const fullyCompleted = isSeasonFullyCompleted(data.tournaments);
    let existingCache = null;

    // Skip past seasons that are already cached (unless --season forces it)
    if (!forceSeason && fullyCompleted && existsSync(filePath)) {
      console.log(`[tournaments] ${season}: fully completed, cache exists — skipping`);
      skipped++;
      continue;
    }

    // For the current/active season, merge TSW IDs from existing cache so
    // we don't re-scrape blog posts for tournaments we already resolved.
    if (existsSync(filePath)) {
      try {
        existingCache = JSON.parse(readFileSync(filePath, 'utf-8'));
        if (existingCache.tournaments) {
          const existingMap = new Map(existingCache.tournaments.map(t => [t.name, t]));
          for (const t of data.tournaments) {
            const prev = existingMap.get(t.name);
            if (prev?.tswId && !t.tswId) {
              t.tswId = prev.tswId;
              t.tswUrl = prev.tswUrl;
            }
            if (prev?.totalPlayers != null && t.totalPlayers == null) {
              t.totalPlayers = prev.totalPlayers;
            }
            if (prev?.venueClub && !t.venueClub) {
              t.venueClub = prev.venueClub;
            }
            if (prev?.venueLocation && !t.venueLocation && /\d/.test(prev.venueLocation)) {
              t.venueLocation = prev.venueLocation;
            }
          }
        }
      } catch { /* ignore */ }
    }

    await enrichWithTswIds(data.tournaments);
    await enrichWithTswDetails(data.tournaments);

    if (existingCache?.tournaments) {
      if (JSON.stringify(existingCache.tournaments) === JSON.stringify(data.tournaments)) {
        console.log(`[tournaments] ${season}: no changes — skipping write`);
        skipped++;
        continue;
      }
    }

    const cache = {
      season,
      tournaments: data.tournaments,
      savedAt: new Date().toISOString(),
    };

    writeFileSync(filePath, JSON.stringify(cache, null, 2));
    console.log(`[tournaments] wrote ${filePath} (${data.tournaments.length} tournaments)`);
    written++;
  }

  console.log(`\n[tournaments] done: ${written} written, ${skipped} skipped`);
}

main().catch((err) => {
  console.error('[tournaments] fatal error:', err);
  process.exit(1);
});
