#!/usr/bin/env node
// Usage: node scripts/scrape-tournament-fixtures.mjs <tswId>
//
// Scrapes all tournament API endpoints from the local API server and saves
// JSON responses into tournament-cache/{tswId}/ for offline serving.
//
// Requires the dev server running on localhost:3001 (npm run dev).

import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const API_BASE = 'http://localhost:3001';

// ── CLI args ─────────────────────────────────────────────────────────────────

const tswId = process.argv[2];
if (!tswId) {
  console.error(`Usage: node scripts/scrape-tournament-fixtures.mjs <tswId>

Examples:
  node scripts/scrape-tournament-fixtures.mjs 9BA4D091-5DA0-44B3-ADD7-511F99031852
`);
  process.exit(1);
}

const outDir = join(PROJECT_ROOT, 'tournament-cache', tswId);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`${resp.status} ${resp.statusText} for ${url}`);
  }
  return resp.json();
}

async function saveJson(relPath, data) {
  const filePath = join(outDir, relPath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
  return filePath;
}

function generateDateParams(startDate, endDate) {
  if (!startDate) return [];
  const params = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : start;
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    params.push(`${y}${m}${d}`);
    current.setDate(current.getDate() + 1);
  }
  return params;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nScraping tournament ${tswId}`);
  console.log(`Output: ${outDir}\n`);

  await mkdir(outDir, { recursive: true });

  // Phase 1: fetch detail + events to discover draw IDs, event IDs, date range
  console.log('Phase 1: Fetching detail and events...');
  const [detail, eventsData] = await Promise.all([
    apiFetch(`/api/tournaments/${encodeURIComponent(tswId)}/detail`),
    apiFetch(`/api/tournaments/${encodeURIComponent(tswId)}/events`),
  ]);

  const tournamentName = detail.name || 'Unknown';
  const dates = detail.dates || '';
  const drawIds = (detail.draws || []).map(d => d.drawId);
  const eventIds = (eventsData.events || []).map(e => e.eventId);

  let dateParams = [];
  let startDate = '';
  let endDate = '';

  try {
    const tournamentsResp = await apiFetch('/api/tournaments');
    const allTournaments = tournamentsResp.tournaments
      ?? Object.values(tournamentsResp.seasons ?? {}).flatMap(s => s.tournaments);
    const match = allTournaments.find(
      t => t.tswId?.toUpperCase() === tswId.toUpperCase(),
    );
    if (match) {
      startDate = match.startDate || '';
      endDate = match.endDate || match.startDate || '';
    }
  } catch { /* ignore */ }

  dateParams = generateDateParams(startDate, endDate);

  console.log(`  Tournament: ${tournamentName}`);
  console.log(`  Dates: ${dates} (${startDate} to ${endDate})`);
  console.log(`  Draws: ${drawIds.length}`);
  console.log(`  Events: ${eventIds.length}`);
  console.log(`  Match days: ${dateParams.join(', ') || '(none found)'}\n`);

  // Phase 2: save detail + events (already fetched)
  await Promise.all([
    saveJson('detail.json', detail),
    saveJson('events.json', eventsData),
  ]);
  console.log('  Saved: detail.json, events.json');

  // Phase 3: fetch remaining static endpoints
  console.log('Phase 2: Fetching static endpoints...');
  const staticEndpoints = ['draws', 'seeds', 'players', 'winners', 'medals'];
  const staticResults = await Promise.allSettled(
    staticEndpoints.map(async (action) => {
      const data = await apiFetch(`/api/tournaments/${encodeURIComponent(tswId)}/${action}`);
      await saveJson(`${action}.json`, data);
      return action;
    }),
  );
  for (const r of staticResults) {
    if (r.status === 'fulfilled') {
      console.log(`  Saved: ${r.value}.json`);
    } else {
      console.warn(`  FAILED: ${r.reason.message}`);
    }
  }

  // Phase 4: fetch matches for each day
  if (dateParams.length > 0) {
    console.log('Phase 3: Fetching matches per day...');
    const matchResults = await Promise.allSettled(
      dateParams.map(async (dp) => {
        const data = await apiFetch(
          `/api/tournaments/${encodeURIComponent(tswId)}/matches?d=${dp}`,
        );
        await saveJson(`matches/${dp}.json`, data);
        return { dp, matchCount: data.matches?.length ?? 0 };
      }),
    );
    for (const r of matchResults) {
      if (r.status === 'fulfilled') {
        console.log(`  Saved: matches/${r.value.dp}.json (${r.value.matchCount} matches)`);
      } else {
        console.warn(`  FAILED: ${r.reason.message}`);
      }
    }
  }

  // Phase 5: fetch each draw bracket
  if (drawIds.length > 0) {
    console.log('Phase 4: Fetching draw brackets...');
    const BRACKET_CONCURRENCY = 5;
    for (let i = 0; i < drawIds.length; i += BRACKET_CONCURRENCY) {
      const batch = drawIds.slice(i, i + BRACKET_CONCURRENCY);
      const bracketResults = await Promise.allSettled(
        batch.map(async (drawId) => {
          const data = await apiFetch(
            `/api/tournaments/${encodeURIComponent(tswId)}/draw-bracket?drawId=${drawId}`,
          );
          await saveJson(`draw-brackets/${drawId}.json`, data);
          return drawId;
        }),
      );
      for (const r of bracketResults) {
        if (r.status === 'fulfilled') {
          console.log(`  Saved: draw-brackets/${r.value}.json`);
        } else {
          console.warn(`  FAILED: ${r.reason.message}`);
        }
      }
    }
  }

  // Phase 6: fetch each event detail
  if (eventIds.length > 0) {
    console.log('Phase 5: Fetching event details...');
    const EVENT_CONCURRENCY = 5;
    for (let i = 0; i < eventIds.length; i += EVENT_CONCURRENCY) {
      const batch = eventIds.slice(i, i + EVENT_CONCURRENCY);
      const eventResults = await Promise.allSettled(
        batch.map(async (eventId) => {
          const data = await apiFetch(
            `/api/tournaments/${encodeURIComponent(tswId)}/event-detail?eventId=${eventId}`,
          );
          await saveJson(`event-details/${eventId}.json`, data);
          return eventId;
        }),
      );
      for (const r of eventResults) {
        if (r.status === 'fulfilled') {
          console.log(`  Saved: event-details/${r.value}.json`);
        } else {
          console.warn(`  FAILED: ${r.reason.message}`);
        }
      }
    }
  }

  // Phase 7: write manifest
  const manifest = {
    tswId,
    tournamentName,
    scrapedAt: new Date().toISOString(),
    startDate,
    endDate,
    dateParams,
    drawIds,
    eventIds,
    files: {
      static: ['detail.json', 'draws.json', 'events.json', 'seeds.json', 'players.json', 'winners.json', 'medals.json'],
      matches: dateParams.map(dp => `matches/${dp}.json`),
      drawBrackets: drawIds.map(id => `draw-brackets/${id}.json`),
      eventDetails: eventIds.map(id => `event-details/${id}.json`),
    },
  };
  await saveJson('_manifest.json', manifest);
  console.log('\n  Saved: _manifest.json');

  const totalFiles = manifest.files.static.length
    + manifest.files.matches.length
    + manifest.files.drawBrackets.length
    + manifest.files.eventDetails.length
    + 1;
  console.log(`\nDone! ${totalFiles} files written to ${outDir}\n`);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
