#!/usr/bin/env node
/**
 * Standalone script to refresh data/rankings-cache.json.
 *
 * Fetches the latest rankings date from usabjrrankings.org, then pulls
 * every age-group / event-type combination and writes the result to disk.
 * Exits with code 0 if the cache was written (new or updated), or code 2
 * if the existing cache is already up-to-date (useful for CI to skip commits).
 *
 * Usage:
 *   node scripts/refresh-cache.mjs            # auto-detect latest date
 *   node scripts/refresh-cache.mjs 2026-03-01 # force a specific date
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CACHE_FILE = join(DATA_DIR, 'rankings-cache.json');
const USAB_BASE = 'https://usabjrrankings.org';

function perDateCacheFile(date) {
  return join(DATA_DIR, `rankings-${date}.json`);
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const AGE_GROUPS = ['U11', 'U13', 'U15', 'U17', 'U19'];
const EVENT_TYPES = ['BS', 'GS', 'BD', 'GD', 'XD'];

// ── HTML parser (same logic as api-server.mjs) ──────────────────────────────

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

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchLatestDate() {
  console.log('[refresh] fetching latest date from USAB homepage…');
  const response = await fetch(USAB_BASE, { headers: BROWSER_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();

  const dates = [];
  const optionRegex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = optionRegex.exec(html)) !== null) {
    const val = m[1].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) dates.push(val);
  }

  if (dates.length === 0) throw new Error('No dates found on USAB homepage');
  console.log(`[refresh] latest date: ${dates[0]} (${dates.length} available)`);
  return dates[0];
}

async function fetchAllRankings(date) {
  const tasks = [];
  for (const ag of AGE_GROUPS) {
    for (const et of EVENT_TYPES) {
      tasks.push({ ag, et });
    }
  }

  const rankingsByCategory = {};
  const allPlayers = new Map();

  console.log(`[refresh] fetching ${tasks.length} ranking pages for date ${date}…`);

  // Fetch in batches of 5 to avoid overwhelming the server
  for (let i = 0; i < tasks.length; i += 5) {
    const batch = tasks.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async ({ ag, et }) => {
        const url = `${USAB_BASE}/?age_group=${ag}&category=${et}&date=${date}`;
        const response = await fetch(url, { headers: BROWSER_HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${ag}-${et}`);
        const html = await response.text();
        return { players: parseRankings(html, ag, et), ag, et };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { players, ag, et } = result.value;
        const catKey = `${ag}-${et}`;
        rankingsByCategory[catKey] = players;
        console.log(`  ${catKey}: ${players.length} players`);

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
        console.warn(`  FAILED: ${batch[results.indexOf(result)]?.ag}-${batch[results.indexOf(result)]?.et}: ${result.reason?.message}`);
      }
    }
  }

  const uniquePlayers = [...allPlayers.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return { rankingsByCategory, uniquePlayers };
}

// ── Fetch all available dates from the USAB homepage ─────────────────────────

async function fetchAllAvailableDates() {
  console.log('[refresh] fetching all available dates from USAB homepage…');
  const response = await fetch(USAB_BASE, { headers: BROWSER_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();

  const dates = [];
  const optionRegex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = optionRegex.exec(html)) !== null) {
    const val = m[1].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) dates.push(val);
  }
  return dates;
}

// ── Write cache files for a single date ──────────────────────────────────────

async function refreshDate(date, { updateLatest = false } = {}) {
  const perDateFile = perDateCacheFile(date);
  if (existsSync(perDateFile)) {
    console.log(`[refresh] per-date cache already exists for ${date} — skipping`);
    return false;
  }

  const { rankingsByCategory, uniquePlayers } = await fetchAllRankings(date);

  if (uniquePlayers.length === 0) {
    console.error(`[refresh] no players fetched for ${date} — skipping`);
    return false;
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // Per-date file: compact JSON, allPlayers only (no rankings duplication)
  const lean = { date, allPlayers: uniquePlayers, savedAt: new Date().toISOString() };
  writeFileSync(perDateFile, JSON.stringify(lean));
  console.log(`[refresh] wrote per-date cache: ${date}, ${uniquePlayers.length} players (compact)`);

  if (updateLatest) {
    // Latest alias: pretty-printed with rankings (used by static frontend import)
    const full = { date, rankings: rankingsByCategory, allPlayers: uniquePlayers, savedAt: lean.savedAt };
    writeFileSync(CACHE_FILE, JSON.stringify(full, null, 2));
    console.log(`[refresh] updated rankings-cache.json (latest) for ${date}`);
  }

  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const backfill = args.includes('--backfill');
  const forcedDate = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

  if (backfill) {
    const allDates = await fetchAllAvailableDates();
    console.log(`[refresh] backfill mode: ${allDates.length} dates available`);
    let fetched = 0;
    for (const date of allDates) {
      const wrote = await refreshDate(date, { updateLatest: date === allDates[0] });
      if (wrote) fetched++;
    }
    console.log(`[refresh] backfill complete: ${fetched} new date(s) cached`);
    process.exit(fetched > 0 ? 0 : 2);
  }

  const date = forcedDate || (await fetchLatestDate());

  // Check if the per-date cache already exists
  if (existsSync(perDateCacheFile(date))) {
    console.log(`[refresh] per-date cache already up-to-date for ${date} — skipping`);
    process.exit(2);
  }

  const wrote = await refreshDate(date, { updateLatest: true });
  process.exit(wrote ? 0 : 1);
}

main().catch((err) => {
  console.error('[refresh] fatal error:', err);
  process.exit(1);
});
