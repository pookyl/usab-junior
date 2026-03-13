#!/usr/bin/env node
/**
 * Scrapes tournament medal results from TournamentSoftware, resolves each
 * winner's USAB Member ID via their profile page, and writes the result to:
 *   data/medals-{tswId}.json
 *
 * Usage:
 *   node scripts/refresh-medals-cache.mjs <tswId> [tswId2 ...] [--force]
 *   node scripts/refresh-medals-cache.mjs --season 2025-2026 [--force]
 *   node scripts/refresh-medals-cache.mjs --all [--force]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Dynamic import so shared.js resolves relative to the project root
process.chdir(ROOT);
const {
  tswFetch,
  parseTswWinners,
  parseTswTournamentPlayers,
  parseTswPlayerMemberId,
  saveMedalsDiskCache,
  loadMedalsDiskCache,
  TSW_BASE,
} = await import('../api/_lib/shared.js');

const DATA_DIR = join(ROOT, 'data');
const PROFILE_CONCURRENCY = 5;

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes('--force');
const all = args.includes('--all');
const seasonIdx = args.indexOf('--season');
const season = seasonIdx !== -1 ? args[seasonIdx + 1] : null;
const tswIds = args.filter((a, i) => !a.startsWith('--') && (seasonIdx === -1 || i !== seasonIdx + 1));

if (!all && !season && tswIds.length === 0) {
  console.error([
    'Usage:',
    '  node scripts/refresh-medals-cache.mjs <tswId> [tswId2 ...] [--force]',
    '  node scripts/refresh-medals-cache.mjs --season 2025-2026 [--force]',
    '  node scripts/refresh-medals-cache.mjs --all [--force]',
  ].join('\n'));
  process.exit(1);
}

// ── Helpers (same logic as medals.js) ────────────────────────────────────────

function normalizePlaces(results) {
  const gold = [], silver = [], bronze = [], fourth = [];
  for (const r of results) {
    const p = r.place.replace(/\s/g, '');
    if (p === '1') gold.push(r);
    else if (p === '1/2') { (gold.length === 0 ? gold : silver).push(r); }
    else if (p === '2') silver.push(r);
    else if (p === '3' || p === '3/4') bronze.push(r);
    else if (p === '4') fourth.push(r);
  }
  if (gold.length === 0 && results.length > 0) gold.push(results[0]);
  if (silver.length === 0 && results.length > 1) silver.push(results[1]);
  if (bronze.length === 0 && results.length > 2) bronze.push(results[2]);
  if (fourth.length === 0 && results.length > 3) {
    const r3 = results[3];
    if (r3 && !bronze.includes(r3)) fourth.push(r3);
  }
  return { gold, silver, bronze, fourth };
}

async function fetchTournamentPlayers(tswId) {
  const playersUrl = `/tournament/${tswId.toLowerCase()}/Players/GetPlayersContent`;
  const resp = await tswFetch(playersUrl, {
    method: 'POST',
    extraHeaders: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${TSW_BASE}/tournament/${tswId}/players`,
    },
    body: '',
  });
  if (!resp.ok) throw new Error(`Players content HTTP ${resp.status}`);
  const html = await resp.text();
  return parseTswTournamentPlayers(html);
}

async function fetchPlayerMemberIds(tswId, playerIds) {
  const memberMap = new Map();
  const queue = [...playerIds];
  let done = 0;

  async function worker() {
    while (queue.length > 0) {
      const pid = queue.shift();
      try {
        const resp = await tswFetch(`/sport/player.aspx?id=${encodeURIComponent(tswId)}&player=${pid}`);
        if (resp.ok) {
          const html = await resp.text();
          const memberId = parseTswPlayerMemberId(html);
          if (memberId) memberMap.set(pid, memberId);
        }
      } catch { /* skip */ }
      done++;
      if (done % 10 === 0) process.stdout.write(`  profiles: ${done}/${playerIds.length}\r`);
    }
  }

  const workers = Array.from({ length: Math.min(PROFILE_CONCURRENCY, playerIds.length) }, () => worker());
  await Promise.all(workers);
  if (playerIds.length > 0) process.stdout.write(`  profiles: ${done}/${playerIds.length}\n`);
  return memberMap;
}

// ── Scrape one tournament ────────────────────────────────────────────────────

async function scrapeMedals(tswId) {
  const [winnersResp, playersMap] = await Promise.all([
    tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`),
    fetchTournamentPlayers(tswId),
  ]);

  if (!winnersResp.ok) throw new Error(`Winners page HTTP ${winnersResp.status}`);
  const winnersHtml = await winnersResp.text();

  const titleMatch = winnersHtml.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
  const tournamentName = titleMatch
    ? titleMatch[1].replace(/^Tournamentsoftware\.com\s*-\s*/i, '').replace(/\s*-\s*Winners$/i, '').trim()
    : '';

  const winnerEvents = parseTswWinners(winnersHtml);

  const uniquePlayerIds = new Set();
  for (const event of winnerEvents) {
    for (const r of event.results) {
      for (const p of r.players) uniquePlayerIds.add(p.playerId);
    }
  }

  console.log(`  ${winnerEvents.length} events, ${uniquePlayerIds.size} unique players`);
  const memberIdMap = await fetchPlayerMemberIds(tswId, [...uniquePlayerIds]);
  console.log(`  resolved ${memberIdMap.size}/${uniquePlayerIds.size} USAB IDs`);

  const medals = [];

  function enrichPlayers(resultEntries) {
    return resultEntries.flatMap(r =>
      r.players.map(p => {
        const entry = playersMap.get(p.playerId);
        const usabId = memberIdMap.get(p.playerId) || '';
        return { name: p.name, club: entry?.club || '', usabId };
      }),
    );
  }

  function enrichBronze(resultEntries) {
    return resultEntries.map(r =>
      r.players.map(p => {
        const entry = playersMap.get(p.playerId);
        const usabId = memberIdMap.get(p.playerId) || '';
        return { name: p.name, club: entry?.club || '', usabId };
      }),
    );
  }

  for (const event of winnerEvents) {
    const { gold, silver, bronze, fourth } = normalizePlaces(event.results);

    medals.push({
      drawName: event.eventName,
      gold: enrichPlayers(gold),
      silver: enrichPlayers(silver),
      bronze: enrichBronze(bronze),
      fourth: enrichBronze(fourth),
    });
  }

  return { tswId, tournamentName, medals };
}

// ── Collect tswIds from tournament cache files ───────────────────────────────

function collectTswIdsFromFile(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  return (data.tournaments || []).filter(t => t.tswId).map(t => t.tswId);
}

function collectAllTswIds() {
  const ids = [];
  try {
    const files = readdirSync(DATA_DIR).filter(f => f.startsWith('tournaments-') && f.endsWith('.json'));
    for (const f of files) {
      ids.push(...collectTswIdsFromFile(join(DATA_DIR, f)));
    }
  } catch (err) {
    console.error('Failed to read tournament cache files:', err.message);
  }
  return ids;
}

function collectSeasonTswIds(season) {
  const filePath = join(DATA_DIR, `tournaments-${season}.json`);
  if (!existsSync(filePath)) {
    console.error(`Season file not found: tournaments-${season}.json`);
    process.exit(1);
  }
  return collectTswIdsFromFile(filePath);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const targets = season ? collectSeasonTswIds(season) : all ? collectAllTswIds() : tswIds;

  if (targets.length === 0) {
    console.log('No tournaments found.');
    return;
  }

  console.log(`Processing ${targets.length} tournament(s)...`);
  let scraped = 0, skipped = 0, failed = 0;

  for (const id of targets) {
    if (!force) {
      const existing = await loadMedalsDiskCache(id);
      if (existing) {
        skipped++;
        continue;
      }
    }

    console.log(`\n[${scraped + skipped + failed + 1}/${targets.length}] ${id}`);
    try {
      const result = await scrapeMedals(id);
      await saveMedalsDiskCache(id, result);
      console.log(`  saved medals-${id.toLowerCase()}.json (${result.medals.length} events)`);
      scraped++;
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Scraped: ${scraped}, Skipped (cached): ${skipped}, Failed: ${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
