#!/usr/bin/env node
// Usage: node scripts/scrape-tournament-fixtures.mjs <tswId> [--all]
//
// Scrapes all tournament data directly from TournamentSoftware.com using
// tswFetch (handles cookie wall) and saves parsed JSON into
// tournament-cache/{tswId}/ for offline serving.
//
// Fully standalone — does NOT require the dev API server to be running.

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

process.chdir(PROJECT_ROOT);
const {
  tswFetch,
  TSW_BASE,
  parseTswTournamentInfo,
  parseTswDrawsList,
  parseTswEvents,
  parseTswSeeding,
  parseTswTournamentPlayersArray,
  parseTswTournamentPlayers,
  parseTswWinners,
  parseTswMatches,
  parseTswDrawType,
  parseTswEliminationDraw,
  parseTswRoundRobinGroups,
  parseTswRoundRobinGroupName,
  parseTswRoundRobinStandings,
  parseTswRoundRobinMatches,
  parseTswEventDetail,
  parseTswPlayerInfo,
  formatMatchDate,
} = await import('../api/_lib/shared.js');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flagAll = args.includes('--all');
const positional = args.filter(a => !a.startsWith('--'));
const tswId = positional[0];

if (!tswId) {
  console.error(`Usage: node scripts/scrape-tournament-fixtures.mjs <tswId> [--all]

Options:
  --all   Include player-id-map scraping (slow, scrapes each player page)

Examples:
  node scripts/scrape-tournament-fixtures.mjs 9BA4D091-5DA0-44B3-ADD7-511F99031852
  node scripts/scrape-tournament-fixtures.mjs 9BA4D091-5DA0-44B3-ADD7-511F99031852 --all
`);
  process.exit(1);
}

const tswIdLower = tswId.toLowerCase();
const outDir = join(PROJECT_ROOT, 'tournament-cache', tswId);

// ── Helpers ──────────────────────────────────────────────────────────────────

function tswOk(resp, label) {
  if (!resp.ok) throw new Error(`${label}: HTTP ${resp.status}`);
  return resp;
}

async function saveJson(relPath, data) {
  const filePath = join(outDir, relPath);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
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

function discoverDateRange() {
  const DATA_DIR = join(PROJECT_ROOT, 'data');
  try {
    const files = readdirSync(DATA_DIR).filter(f => f.startsWith('tournaments-') && f.endsWith('.json'));
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'));
      const tournaments = data.tournaments || [];
      const match = tournaments.find(t => t.tswId?.toUpperCase() === tswId.toUpperCase());
      if (match) return { startDate: match.startDate || '', endDate: match.endDate || match.startDate || '' };
    }
  } catch { /* ignore */ }
  return { startDate: '', endDate: '' };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nScraping tournament ${tswId} directly from TSW`);
  console.log(`Output: ${outDir}\n`);

  mkdirSync(outDir, { recursive: true });

  // Phase 1: fetch detail (draws page) + events page
  console.log('Phase 1: Fetching detail and events from TSW...');
  const [drawsResp, eventsResp] = await Promise.all([
    tswFetch(`/sport/draws.aspx?id=${encodeURIComponent(tswId)}`),
    tswFetch(`/sport/events.aspx?id=${encodeURIComponent(tswId)}`),
  ]);
  tswOk(drawsResp, 'draws page');
  tswOk(eventsResp, 'events page');

  const drawsHtml = await drawsResp.text();
  const eventsHtml = await eventsResp.text();

  const info = parseTswTournamentInfo(drawsHtml);
  const draws = parseTswDrawsList(drawsHtml);
  const events = parseTswEvents(eventsHtml);

  const detail = {
    tswId,
    name: info.name,
    dates: info.dates,
    location: info.location,
    draws,
    tswUrl: `https://www.tournamentsoftware.com/tournament/${tswId}`,
  };
  const eventsData = { tswId, eventCount: events.length, events };

  const tournamentName = detail.name || 'Unknown';
  const dates = detail.dates || '';
  const drawIds = draws.map(d => d.drawId);
  const eventIds = events.map(e => e.eventId);

  const { startDate, endDate } = discoverDateRange();
  const dateParams = generateDateParams(startDate, endDate);

  console.log(`  Tournament: ${tournamentName}`);
  console.log(`  Dates: ${dates} (${startDate} to ${endDate})`);
  console.log(`  Draws: ${drawIds.length}`);
  console.log(`  Events: ${eventIds.length}`);
  console.log(`  Match days: ${dateParams.join(', ') || '(none found)'}\n`);

  // Phase 2: save detail + events
  await Promise.all([
    saveJson('detail.json', detail),
    saveJson('events.json', eventsData),
  ]);
  console.log('  Saved: detail.json, events.json');

  // Phase 3: fetch draws, seeds, players, winners, medals from TSW
  console.log('Phase 2: Fetching static endpoints from TSW...');

  const drawsData = { tswId, drawCount: draws.length, draws };
  saveJson('draws.json', drawsData);
  console.log('  Saved: draws.json (reused from Phase 1)');

  const staticTasks = [
    {
      name: 'seeds',
      fetch: async () => {
        const resp = tswOk(await tswFetch(`/sport/seeds.aspx?id=${encodeURIComponent(tswId)}`), 'seeds page');
        const html = await resp.text();
        const seedEvents = parseTswSeeding(html);
        return { tswId, eventCount: seedEvents.length, events: seedEvents };
      },
    },
    {
      name: 'players',
      fetch: async () => {
        const resp = tswOk(await tswFetch(`/tournament/${tswIdLower}/Players/GetPlayersContent`, {
          method: 'POST',
          extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${TSW_BASE}/tournament/${tswId}/players` },
          body: '',
        }), 'players content');
        const html = await resp.text();
        const players = parseTswTournamentPlayersArray(html);
        return { tswId, playerCount: players.length, players };
      },
    },
    {
      name: 'winners',
      fetch: async () => {
        const resp = tswOk(await tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`), 'winners page');
        const html = await resp.text();
        const winnerEvents = parseTswWinners(html);
        const titleMatch = html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
        const tn = titleMatch
          ? titleMatch[1].replace(/^Tournamentsoftware\.com\s*-\s*/i, '').replace(/\s*-\s*Winners$/i, '').trim()
          : '';
        return { tswId, tournamentName: tn, events: winnerEvents };
      },
    },
    {
      name: 'medals',
      fetch: async () => {
        const [winnersResp, playersResp] = await Promise.all([
          tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`),
          tswFetch(`/tournament/${tswIdLower}/Players/GetPlayersContent`, {
            method: 'POST',
            extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${TSW_BASE}/tournament/${tswId}/players` },
            body: '',
          }),
        ]);
        tswOk(winnersResp, 'winners page');
        tswOk(playersResp, 'players content');
        const winnersHtml = await winnersResp.text();
        const playersHtml = await playersResp.text();
        const playersMap = parseTswTournamentPlayers(playersHtml);
        const winnerEvents = parseTswWinners(winnersHtml);

        const titleMatch = winnersHtml.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
        const tn = titleMatch
          ? titleMatch[1].replace(/^Tournamentsoftware\.com\s*-\s*/i, '').replace(/\s*-\s*Winners$/i, '').trim()
          : '';

        const medals = winnerEvents.map(event => {
          const { gold, silver, bronze, fourth } = normalizePlaces(event.results);
          const enrichPlayers = (entries) => entries.flatMap(r =>
            r.players.map(p => ({ name: p.name, club: playersMap.get(p.playerId)?.club || '', playerId: p.playerId })),
          );
          const enrichBronze = (entries) => entries.map(r =>
            r.players.map(p => ({ name: p.name, club: playersMap.get(p.playerId)?.club || '', playerId: p.playerId })),
          );
          const ageGroup = (event.eventName.match(/U\d+/i) || [''])[0].toUpperCase();
          const eventType = (event.eventName.match(/^(BS|GS|BD|GD|XD)/i) || [''])[0].toUpperCase();
          return {
            drawName: event.eventName, ageGroup, eventType,
            gold: enrichPlayers(gold), silver: enrichPlayers(silver),
            bronze: enrichBronze(bronze), fourth: enrichBronze(fourth),
          };
        });

        return { tswId, tournamentName: tn, clubs: buildClubStats(medals), medals };
      },
    },
  ];

  const staticResults = await Promise.allSettled(staticTasks.map(async (t) => {
    const data = await t.fetch();
    saveJson(`${t.name}.json`, data);
    return t.name;
  }));
  for (const r of staticResults) {
    if (r.status === 'fulfilled') console.log(`  Saved: ${r.value}.json`);
    else console.warn(`  FAILED: ${r.reason.message}`);
  }

  // Phase 4: fetch matches for each day
  let totalMatchCount = 0;
  if (dateParams.length > 0) {
    console.log('Phase 3: Fetching matches per day from TSW...');
    const matchResults = await Promise.allSettled(
      dateParams.map(async (dp) => {
        const resp = tswOk(await tswFetch(
          `/tournament/${tswIdLower}/Matches/MatchesInDay?date=${encodeURIComponent(dp)}`,
        ), `matches ${dp}`);
        const html = await resp.text();
        const matches = parseTswMatches(html);
        const data = { tswId, date: formatMatchDate(dp), matches };
        saveJson(`matches/${dp}.json`, data);
        return { dp, matchCount: matches.length };
      }),
    );
    for (const r of matchResults) {
      if (r.status === 'fulfilled') {
        totalMatchCount += r.value.matchCount;
        console.log(`  Saved: matches/${r.value.dp}.json (${r.value.matchCount} matches)`);
      } else {
        console.warn(`  FAILED: ${r.reason.message}`);
      }
    }
  }

  // Phase 5: fetch each draw bracket
  if (drawIds.length > 0) {
    console.log('Phase 4: Fetching draw brackets from TSW...');
    const BRACKET_CONCURRENCY = 5;
    for (let i = 0; i < drawIds.length; i += BRACKET_CONCURRENCY) {
      const batch = drawIds.slice(i, i + BRACKET_CONCURRENCY);
      const bracketResults = await Promise.allSettled(
        batch.map(async (drawId) => {
          const drawPath = `/tournament/${tswIdLower}/draw/${drawId}`;
          const resp = tswOk(await tswFetch(drawPath), `draw ${drawId}`);
          const html = await resp.text();
          const drawType = parseTswDrawType(html);

          let result;
          if (drawType === 'round-robin') {
            const groups = parseTswRoundRobinGroups(html);
            for (const g of groups) {
              if (g.active && !g.drawId) g.drawId = parseInt(drawId, 10);
            }
            const groupName = parseTswRoundRobinGroupName(html);
            const [standingsResp, matchesResp] = await Promise.all([
              tswFetch(`/tournament/${tswIdLower}/Draw/${drawId}/GetStandings`),
              tswFetch(`/tournament/${tswIdLower}/Draw/${drawId}/GetMatchesContent?tabindex=1`),
            ]);
            tswOk(standingsResp, `draw ${drawId} standings`);
            tswOk(matchesResp, `draw ${drawId} matches`);
            const standings = parseTswRoundRobinStandings(await standingsResp.text());
            const matches = parseTswRoundRobinMatches(await matchesResp.text());
            result = { tswId, drawId: parseInt(drawId, 10), drawType, groupName, groups, standings, matches };
          } else {
            const sections = parseTswEliminationDraw(html);
            result = { tswId, drawId: parseInt(drawId, 10), drawType, sections };
          }

          saveJson(`draw-brackets/${drawId}.json`, result);
          return drawId;
        }),
      );
      for (const r of bracketResults) {
        if (r.status === 'fulfilled') console.log(`  Saved: draw-brackets/${r.value}.json`);
        else console.warn(`  FAILED: ${r.reason.message}`);
      }
    }
  }

  // Phase 6: fetch each event detail
  if (eventIds.length > 0) {
    console.log('Phase 5: Fetching event details from TSW...');
    const EVENT_CONCURRENCY = 5;
    for (let i = 0; i < eventIds.length; i += EVENT_CONCURRENCY) {
      const batch = eventIds.slice(i, i + EVENT_CONCURRENCY);
      const eventResults = await Promise.allSettled(
        batch.map(async (eventId) => {
          const eventPath = `/sport/event.aspx?id=${encodeURIComponent(tswId)}&event=${encodeURIComponent(eventId)}`;
          const resp = tswOk(await tswFetch(eventPath), `event ${eventId}`);
          const html = await resp.text();
          const parsed = parseTswEventDetail(html);
          const result = { tswId, eventId: parseInt(eventId, 10), eventName: parsed.eventName, entriesCount: parsed.entriesCount, draws: parsed.draws, entries: parsed.entries };
          saveJson(`event-details/${eventId}.json`, result);
          return eventId;
        }),
      );
      for (const r of eventResults) {
        if (r.status === 'fulfilled') console.log(`  Saved: event-details/${r.value}.json`);
        else console.warn(`  FAILED: ${r.reason.message}`);
      }
    }
  }

  // Phase 7: scrape TSW player pages to build playerId→memberId (USAB ID) map
  // Skipped by default (slow). Pass --all to include.
  let playersData;
  const playerIdMap = {};
  const unmappedPlayers = [];
  let totalPlayerCount = 0;

  try {
    playersData = JSON.parse(await readFile(join(outDir, 'players.json'), 'utf-8'));
  } catch { /* ignore */ }

  const allPlayers = playersData?.players || [];
  totalPlayerCount = allPlayers.length;
  const playerIds = allPlayers.map(p => p.playerId).filter(Boolean);
  const playerLookup = new Map(allPlayers.map(p => [p.playerId, p]));

  if (flagAll) {
    if (playerIds.length > 0) {
      console.log(`Phase 6: Scraping TSW player pages (${playerIds.length} players)...`);
      const PLAYER_CONCURRENCY = 5;
      let resolved = 0;
      for (let i = 0; i < playerIds.length; i += PLAYER_CONCURRENCY) {
        const batch = playerIds.slice(i, i + PLAYER_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (pid) => {
            const resp = await tswFetch(`/tournament/${tswIdLower}/player/${pid}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status} for player ${pid}`);
            const html = await resp.text();
            const { memberId } = parseTswPlayerInfo(html);
            if (memberId) {
              playerIdMap[pid] = memberId;
            } else {
              const info = playerLookup.get(pid);
              unmappedPlayers.push({ playerId: pid, name: info?.name || 'Unknown', club: info?.club || '' });
            }
            return { pid, memberId: memberId || null };
          }),
        );
        resolved += batch.length;
        const failed = results.filter(r => r.status === 'rejected').length;
        process.stdout.write(`\r  Progress: ${resolved}/${playerIds.length} players (${Object.keys(playerIdMap).length} mapped)${failed ? `, ${failed} failed` : ''}`);
      }
      console.log('');
      saveJson('player-id-map.json', playerIdMap);
      console.log(`  Saved: player-id-map.json (${Object.keys(playerIdMap).length} of ${playerIds.length} players have USAB IDs)`);
    }
  } else {
    console.log('Phase 6: Skipping player-id-map (pass --all to include)');
  }

  // Phase 8: write manifest
  const staticFiles = ['detail.json', 'draws.json', 'events.json', 'seeds.json', 'players.json', 'winners.json', 'medals.json'];
  if (flagAll) staticFiles.push('player-id-map.json');

  const manifest = {
    tswId,
    tournamentName,
    scrapedAt: new Date().toISOString(),
    startDate,
    endDate,
    dateParams,
    drawIds,
    eventIds,
    playerIdMapIncluded: flagAll,
    mappedPlayerCount: Object.keys(playerIdMap).length,
    files: {
      static: staticFiles,
      matches: dateParams.map(dp => `matches/${dp}.json`),
      drawBrackets: drawIds.map(id => `draw-brackets/${id}.json`),
      eventDetails: eventIds.map(id => `event-details/${id}.json`),
    },
  };
  saveJson('_manifest.json', manifest);
  console.log('\n  Saved: _manifest.json');

  // Update public/cached-tournaments.json so the frontend knows this tournament is cached
  const publicManifestPath = join(PROJECT_ROOT, 'public', 'cached-tournaments.json');
  let cachedIds = [];
  try { cachedIds = JSON.parse(readFileSync(publicManifestPath, 'utf-8')); } catch { /* first run */ }
  const upperTswId = tswId.toUpperCase();
  if (!cachedIds.includes(upperTswId)) {
    cachedIds.push(upperTswId);
    cachedIds.sort();
    writeFileSync(publicManifestPath, JSON.stringify(cachedIds, null, 2) + '\n');
    console.log('  Updated: public/cached-tournaments.json');
  }

  const totalFiles = manifest.files.static.length
    + manifest.files.matches.length
    + manifest.files.drawBrackets.length
    + manifest.files.eventDetails.length
    + 1;

  // Folder size
  let folderSize = 'unknown';
  try {
    folderSize = execSync(`du -sh "${outDir}"`, { encoding: 'utf-8' }).split('\t')[0].trim();
  } catch { /* ignore */ }

  // Summary
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  SCRAPE SUMMARY');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Tournament : ${tournamentName}`);
  console.log(`  TSW ID     : ${tswId}`);
  console.log(`  Dates      : ${startDate || '?'} to ${endDate || '?'}`);
  console.log(`  Draws      : ${drawIds.length}`);
  console.log(`  Events     : ${eventIds.length}`);
  console.log(`  Match days : ${dateParams.length} (${totalMatchCount} total matches)`);
  console.log(`  Players    : ${totalPlayerCount}`);
  if (flagAll) {
    console.log(`  USAB mapped: ${Object.keys(playerIdMap).length} of ${playerIds.length}`);
    if (unmappedPlayers.length > 0) {
      console.log(`  Unmapped players (${unmappedPlayers.length}):`);
      for (const p of unmappedPlayers) {
        console.log(`    - ${p.name}${p.club ? ` (${p.club})` : ''} [playerId: ${p.playerId}]`);
      }
    }
  } else {
    console.log('  USAB mapped: skipped (use --all to include)');
  }
  console.log(`  Total files: ${totalFiles}`);
  console.log(`  Folder size: ${folderSize}`);
  console.log(`  Output     : ${outDir}`);
  console.log('════════════════════════════════════════════════════════\n');
}

// ── Medals helpers (mirrored from action handler) ────────────────────────────

function normalizePlaces(results) {
  const gold = [], silver = [], bronze = [], fourth = [];
  const hasExplicit3 = results.some(r => r.place.replace(/\s/g, '') === '3');
  for (const r of results) {
    const p = r.place.replace(/\s/g, '');
    if (p === '1') gold.push(r);
    else if (p === '1/2') { (gold.length === 0 ? gold : silver).push(r); }
    else if (p === '2') silver.push(r);
    else if (p === '3') bronze.push(r);
    else if (p === '3/4') (hasExplicit3 ? fourth : bronze).push(r);
    else if (p === '4') fourth.push(r);
  }
  if (gold.length === 0 && results.length > 0) gold.push(results[0]);
  if (silver.length === 0 && results.length > 1) silver.push(results[1]);
  if (bronze.length === 0 && results.length > 2) bronze.push(results[2]);
  if (fourth.length === 0 && results.length > 3) {
    const used = new Set([...gold, ...silver, ...bronze]);
    fourth.push(...results.filter(r => !used.has(r)).slice(0, 1));
  }
  return { gold, silver, bronze, fourth };
}

function buildClubStats(medals) {
  const stats = new Map();
  function count(players, medalType) {
    for (const p of players) {
      const club = p.club || 'N/A';
      if (!stats.has(club)) stats.set(club, { gold: 0, silver: 0, bronze: 0 });
      stats.get(club)[medalType]++;
    }
  }
  for (const m of medals) {
    count(m.gold, 'gold');
    count(m.silver, 'silver');
    for (const team of m.bronze) count(team, 'bronze');
    for (const team of (m.fourth || [])) count(team, 'bronze');
  }
  return [...stats.entries()]
    .map(([club, c]) => ({ club, ...c, total: c.gold + c.silver + c.bronze }))
    .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
