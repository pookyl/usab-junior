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
 *   node scripts/refresh-rankings-cache.mjs            # auto-detect latest date
 *   node scripts/refresh-rankings-cache.mjs 2026-03-01 # force a specific date
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  BROWSER_HEADERS,
  USAB_BASE,
  fetchWithRetry,
  parseRankings,
} from '../api/_lib/shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CACHE_FILE = join(DATA_DIR, 'rankings-cache.json');
const META_FILE = join(DATA_DIR, 'rankings-meta.json');
const PLAYER_DIRECTORY_INDEX_FILE = join(DATA_DIR, 'player-directory.json');
const PLAYER_TRENDS_INDEX_FILE = join(DATA_DIR, 'player-ranking-trends.json');

function perDateCacheFile(date) {
  return join(DATA_DIR, `rankings-${date}.json`);
}

const AGE_GROUPS = ['U11', 'U13', 'U15', 'U17', 'U19'];
const EVENT_TYPES = ['BS', 'GS', 'BD', 'GD', 'XD'];

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchLatestDate() {
  console.log('[refresh] fetching latest date from USAB homepage…');
  const response = await fetchWithRetry(
    USAB_BASE,
    { headers: BROWSER_HEADERS },
    { timeoutMs: 30_000, retries: 2 },
  );
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
  const failedCategories = [];

  console.log(`[refresh] fetching ${tasks.length} ranking pages for date ${date}…`);

  // Fetch in batches of 5 to avoid overwhelming the server
  for (let i = 0; i < tasks.length; i += 5) {
    const batch = tasks.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async ({ ag, et }) => {
        const url = `${USAB_BASE}/?age_group=${ag}&category=${et}&date=${date}`;
        const response = await fetchWithRetry(
          url,
          { headers: BROWSER_HEADERS },
          { timeoutMs: 30_000, retries: 2 },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${ag}-${et}`);
        const html = await response.text();
        return { players: parseRankings(html, ag, et), ag, et };
      }),
    );

    for (const [index, result] of results.entries()) {
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
        const failedTask = batch[index];
        const catKey = `${failedTask.ag}-${failedTask.et}`;
        failedCategories.push(catKey);
        console.warn(`  FAILED: ${catKey}: ${result.reason?.message}`);
      }
    }
  }

  const uniquePlayers = [...allPlayers.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return { rankingsByCategory, uniquePlayers, failedCategories };
}

// ── Fetch all available dates from the USAB homepage ─────────────────────────

async function fetchAllAvailableDates() {
  console.log('[refresh] fetching all available dates from USAB homepage…');
  const response = await fetchWithRetry(
    USAB_BASE,
    { headers: BROWSER_HEADERS },
    { timeoutMs: 30_000, retries: 2 },
  );
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

function listPerDateCacheDates() {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .map((fileName) => fileName.match(/^rankings-(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? null)
    .filter(Boolean)
    .sort();
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function createEmptyDirectoryEntry(player) {
  return {
    usabId: player.usabId,
    latestName: player.name,
    nameSet: new Set([player.name]),
  };
}

function createEmptyTrendEntry(player) {
  return {
    usabId: player.usabId,
    name: player.name,
    trend: [],
  };
}

function hydrateDirectoryMap(indexed) {
  const map = new Map();
  for (const player of indexed?.players || indexed?.directory || []) {
    map.set(player.usabId, {
      usabId: player.usabId,
      latestName: player.name,
      nameSet: new Set(player.names || [player.name]),
    });
  }
  return map;
}

function hydrateTrendMap(indexed) {
  const map = new Map();
  for (const player of Object.values(indexed?.players || {})) {
    map.set(player.usabId, {
      usabId: player.usabId,
      name: player.name,
      trend: [...(player.trend || [])],
    });
  }
  return map;
}

function applyDateToIndexes(date, allPlayers, directoryMap, trendMap) {
  for (const player of allPlayers) {
    const directoryEntry = directoryMap.get(player.usabId) || createEmptyDirectoryEntry(player);
    directoryEntry.latestName = player.name || directoryEntry.latestName;
    if (player.name) directoryEntry.nameSet.add(player.name);
    directoryMap.set(player.usabId, directoryEntry);

    const trendEntry = trendMap.get(player.usabId) || createEmptyTrendEntry(player);
    trendEntry.name = player.name || trendEntry.name;
    const existingIndex = trendEntry.trend.findIndex((point) => point.date === date);
    const nextPoint = { date, entries: player.entries };
    if (existingIndex >= 0) trendEntry.trend[existingIndex] = nextPoint;
    else trendEntry.trend.push(nextPoint);
    trendMap.set(player.usabId, trendEntry);
  }
}

function persistPlayerIndexes(directoryMap, trendMap, dates) {
  const savedAt = new Date().toISOString();
  const normalizedDates = [...new Set(dates)].sort();
  const directoryPlayers = [...directoryMap.values()]
    .map((entry) => ({
      usabId: entry.usabId,
      name: entry.latestName,
      names: [entry.latestName, ...[...entry.nameSet].filter((name) => name !== entry.latestName)],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const trendPlayers = Object.fromEntries(
    [...trendMap.values()].map((entry) => [
      entry.usabId,
      {
        usabId: entry.usabId,
        name: entry.name,
        trend: [...entry.trend].sort((a, b) => a.date.localeCompare(b.date)),
      },
    ]),
  );

  writeFileSync(PLAYER_DIRECTORY_INDEX_FILE, JSON.stringify({
    savedAt,
    dates: normalizedDates,
    count: directoryPlayers.length,
    players: directoryPlayers,
  }) + '\n');

  writeFileSync(PLAYER_TRENDS_INDEX_FILE, JSON.stringify({
    savedAt,
    dates: normalizedDates,
    count: Object.keys(trendPlayers).length,
    players: trendPlayers,
  }) + '\n');
}

function rebuildPlayerIndexes() {
  const dates = listPerDateCacheDates();
  const directoryMap = new Map();
  const trendMap = new Map();

  for (const date of dates) {
    const disk = readJsonIfExists(perDateCacheFile(date));
    if (!disk?.allPlayers) continue;
    applyDateToIndexes(date, disk.allPlayers, directoryMap, trendMap);
  }

  persistPlayerIndexes(directoryMap, trendMap, dates);
  console.log(`[refresh] rebuilt player indexes (${directoryMap.size} directory players, ${trendMap.size} trend entries)`);
}

function updatePlayerIndexes(newDates) {
  const normalizedNewDates = [...new Set(newDates)].sort();
  if (normalizedNewDates.length === 0) return;

  const existingDirectoryIndex = readJsonIfExists(PLAYER_DIRECTORY_INDEX_FILE);
  const existingTrendIndex = readJsonIfExists(PLAYER_TRENDS_INDEX_FILE);
  const canIncrementallyUpdate = existingDirectoryIndex?.dates && existingTrendIndex?.dates;

  if (!canIncrementallyUpdate) {
    rebuildPlayerIndexes();
    return;
  }

  const existingDates = [...new Set([
    ...(existingDirectoryIndex.dates || []),
    ...(existingTrendIndex.dates || []),
  ])].sort();

  // If historical backfill landed before the currently indexed range, rebuild once.
  if (normalizedNewDates[0] < (existingDates[existingDates.length - 1] || '')) {
    rebuildPlayerIndexes();
    return;
  }

  const directoryMap = hydrateDirectoryMap(existingDirectoryIndex);
  const trendMap = hydrateTrendMap(existingTrendIndex);

  for (const date of normalizedNewDates) {
    const disk = readJsonIfExists(perDateCacheFile(date));
    if (!disk?.allPlayers) continue;
    applyDateToIndexes(date, disk.allPlayers, directoryMap, trendMap);
  }

  persistPlayerIndexes(directoryMap, trendMap, [...existingDates, ...normalizedNewDates]);
  console.log(`[refresh] incrementally updated player indexes for ${normalizedNewDates.join(', ')}`);
}

// ── Write cache files for a single date ──────────────────────────────────────

async function refreshDate(date, { updateLatest = false } = {}) {
  const perDateFile = perDateCacheFile(date);
  if (existsSync(perDateFile)) {
    console.log(`[refresh] per-date cache already exists for ${date} — skipping`);
    return { wrote: false, failed: false };
  }

  const { rankingsByCategory, uniquePlayers, failedCategories } = await fetchAllRankings(date);

  if (failedCategories.length > 0) {
    console.error(`[refresh] incomplete fetch for ${date} — missing categories: ${failedCategories.join(', ')}`);
    return { wrote: false, failed: true };
  }

  if (uniquePlayers.length === 0) {
    console.error(`[refresh] no players fetched for ${date} — skipping`);
    return { wrote: false, failed: true };
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // Per-date file: compact JSON, allPlayers only (no rankings duplication)
  const lean = { date, allPlayers: uniquePlayers, savedAt: new Date().toISOString() };
  writeFileSync(perDateFile, JSON.stringify(lean));
  console.log(`[refresh] wrote per-date cache: ${date}, ${uniquePlayers.length} players (compact)`);

  if (updateLatest) {
    const full = { date, rankings: rankingsByCategory, allPlayers: uniquePlayers, savedAt: lean.savedAt };
    writeFileSync(CACHE_FILE, JSON.stringify(full, null, 2));
    console.log(`[refresh] updated rankings-cache.json (latest) for ${date}`);

    writeFileSync(META_FILE, JSON.stringify({ date }) + '\n');
    console.log(`[refresh] updated rankings-meta.json for ${date}`);
  }

  return { wrote: true, failed: false };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const backfill = args.includes('--backfill');
  const rebuildOnly = args.includes('--rebuild-indexes');
  const forcedDate = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

  if (rebuildOnly) {
    rebuildPlayerIndexes();
    process.exit(0);
  }

  if (backfill) {
    const allDates = await fetchAllAvailableDates();
    console.log(`[refresh] backfill mode: ${allDates.length} dates available`);
    let fetched = 0;
    const newDates = [];
    const failedDates = [];
    for (const date of allDates) {
      const result = await refreshDate(date, { updateLatest: date === allDates[0] });
      if (result.wrote) {
        fetched++;
        newDates.push(date);
      }
      if (result.failed) failedDates.push(date);
    }
    if (fetched > 0) updatePlayerIndexes(newDates);
    if (failedDates.length > 0) {
      console.error(`[refresh] backfill failed for ${failedDates.length} date(s): ${failedDates.join(', ')}`);
      process.exit(1);
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

  const result = await refreshDate(date, { updateLatest: true });
  if (result.wrote) updatePlayerIndexes([date]);
  process.exit(result.wrote ? 0 : result.failed ? 1 : 2);
}

main().catch((err) => {
  console.error('[refresh] fatal error:', err);
  process.exit(1);
});
