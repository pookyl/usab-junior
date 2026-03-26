#!/usr/bin/env node
// Usage: node scripts/refresh-tournament-cache.mjs <tswId> [--all]
//
// Refreshes one tournament cache tree directly from TournamentSoftware.com using
// tswFetch (handles cookie wall) and saves parsed JSON into
// data/tournament-cache/ using either a final folder or a timestamped snapshot
// plus a {tswId} symlink, depending on whether the tournament has finished.
//
// Fully standalone — does NOT require the dev API server to be running.

import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  lstatSync,
  readlinkSync,
  rmSync,
  renameSync,
  symlinkSync,
} from 'fs';
import { readFile, readdir } from 'fs/promises';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CACHE_ROOT = join(PROJECT_ROOT, 'data', 'tournament-cache');

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
  console.error(`Usage: node scripts/refresh-tournament-cache.mjs <tswId> [--all]

Options:
  --all   Include player-id-map scraping (slow, scrapes each player page)

Examples:
  node scripts/refresh-tournament-cache.mjs 9BA4D091-5DA0-44B3-ADD7-511F99031852
  node scripts/refresh-tournament-cache.mjs 9BA4D091-5DA0-44B3-ADD7-511F99031852 --all
`);
  process.exit(1);
}

const tswIdLower = tswId.toLowerCase();
let outDir = '';

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

async function runInBatches(items, concurrency, worker) {
  const batchSize = Math.max(1, concurrency);
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

function resolveDrawForEvent(draws, eventName) {
  const exact = draws.find((draw) => draw.name === eventName);
  if (exact) return exact;
  return draws.find(
    (draw) => draw.name.startsWith(eventName)
      && !/consolation/i.test(draw.name)
      && !/play-?off/i.test(draw.name),
  ) ?? null;
}

function classifyDrawType(drawType) {
  const normalized = (drawType || '').toLowerCase();
  if (normalized.includes('elimination')) return 'elimination';
  if (normalized.includes('round')) return 'round-robin';
  return 'unknown';
}

function parseScheduledTime(timeStr) {
  if (!timeStr) return { date: '', time: '', dateLabel: '' };
  const match = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (match) {
    const date = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    const dateObj = new Date(`${date}T00:00:00`);
    return {
      date,
      time: match[4].trim(),
      dateLabel: Number.isNaN(dateObj.getTime())
        ? ''
        : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  }
  return { date: '', time: timeStr, dateLabel: '' };
}

const MONTH_MAP = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function normalizeYear(year) {
  let y = Number(year);
  if (y < 100) y += 2000;
  return String(y);
}

function toISODate(year, month, day) {
  return `${normalizeYear(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateToken(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) return toISODate(slashMatch[3], slashMatch[1], slashMatch[2]);

  const wordMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{2,4})$/);
  if (wordMatch) {
    const month = MONTH_MAP[wordMatch[1].toLowerCase()];
    if (month) return toISODate(wordMatch[3], month, wordMatch[2]);
  }

  return null;
}

function parseDateRangeText(raw) {
  if (!raw) return { startDate: '', endDate: '' };
  const cleaned = raw.trim().replace(/\s+/g, ' ');

  const numericRange = cleaned.match(
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:-|to)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  );
  if (numericRange) {
    return {
      startDate: parseDateToken(numericRange[1]) || '',
      endDate: parseDateToken(numericRange[2]) || '',
    };
  }

  const numericSingle = cleaned.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
  if (numericSingle) {
    const date = parseDateToken(numericSingle[1]) || '';
    return { startDate: date, endDate: date };
  }

  const monthRange = cleaned.match(
    /([A-Za-z]+\s+\d{1,2},?\s*\d{2,4})\s*(?:-|to)\s*([A-Za-z]+\s+\d{1,2},?\s*\d{2,4})/i,
  );
  if (monthRange) {
    return {
      startDate: parseDateToken(monthRange[1]) || '',
      endDate: parseDateToken(monthRange[2]) || '',
    };
  }

  const monthDayRange = cleaned.match(/([A-Za-z]+)\s+(\d{1,2})\s*(?:-|to)\s*(\d{1,2}),?\s*(\d{2,4})/i);
  if (monthDayRange) {
    const month = MONTH_MAP[monthDayRange[1].toLowerCase()];
    if (month) {
      return {
        startDate: toISODate(monthDayRange[4], month, monthDayRange[2]),
        endDate: toISODate(monthDayRange[4], month, monthDayRange[3]),
      };
    }
  }

  const single = parseDateToken(cleaned);
  return single ? { startDate: single, endDate: single } : { startDate: '', endDate: '' };
}

function parseTournamentDateRange(html, fallbackDates) {
  const parsedTimes = [];
  const timeRe = /<time\b[^>]*(?:datetime="([^"]+)")?[^>]*>([^<]+)<\/time>/gi;
  let match;
  while ((match = timeRe.exec(html)) !== null) {
    const candidate = parseDateToken(match[1] || '') || parseDateToken(match[2] || '');
    if (candidate && !parsedTimes.includes(candidate)) parsedTimes.push(candidate);
  }

  if (parsedTimes.length >= 2) {
    return { startDate: parsedTimes[0], endDate: parsedTimes[1] };
  }
  if (parsedTimes.length === 1) {
    return { startDate: parsedTimes[0], endDate: parsedTimes[0] };
  }

  return parseDateRangeText(fallbackDates);
}

function isTournamentFinished(endDate) {
  if (!endDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > endDate;
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function getPathInfo(path) {
  if (!existsSync(path)) return null;
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    const linkTarget = readlinkSync(path);
    return {
      type: 'symlink',
      path,
      linkTarget,
      absoluteTarget: join(dirname(path), linkTarget),
    };
  }
  if (stats.isDirectory()) return { type: 'directory', path };
  return { type: 'file', path };
}

function isManagedSnapshotPath(path) {
  return path.startsWith(`${CACHE_ROOT}/`) && path !== join(CACHE_ROOT, tswId) && path.includes(`${tswId}-`);
}

function planOutput(tswIdValue, endDate) {
  const canonicalDir = join(CACHE_ROOT, tswIdValue);
  if (isTournamentFinished(endDate)) {
    return {
      mode: 'final',
      canonicalDir,
      writeDir: join(CACHE_ROOT, `${tswIdValue}.tmp-${formatTimestamp()}`),
    };
  }

  const snapshotName = `${tswIdValue}-${formatTimestamp()}`;
  return {
    mode: 'snapshot',
    canonicalDir,
    snapshotName,
    writeDir: join(CACHE_ROOT, snapshotName),
  };
}

function finalizeOutput(plan) {
  const existing = getPathInfo(plan.canonicalDir);
  const summary = {
    mode: plan.mode,
    canonicalDir: plan.canonicalDir,
    writeDir: plan.writeDir,
    replacedPathType: existing?.type || null,
    previousLinkTarget: existing?.type === 'symlink' ? existing.absoluteTarget : null,
    removedSnapshotDir: null,
    finalDir: null,
    symlinkPath: null,
    symlinkTarget: null,
  };

  if (plan.mode === 'final') {
    if (existing?.type === 'symlink') {
      rmSync(plan.canonicalDir, { force: true });
      if (isManagedSnapshotPath(existing.absoluteTarget) && existsSync(existing.absoluteTarget)) {
        rmSync(existing.absoluteTarget, { recursive: true, force: true });
        summary.removedSnapshotDir = existing.absoluteTarget;
      }
    } else if (existing) {
      rmSync(plan.canonicalDir, { recursive: true, force: true });
    }

    renameSync(plan.writeDir, plan.canonicalDir);
    summary.finalDir = plan.canonicalDir;
    return summary;
  }

  if (existing?.type === 'symlink') {
    rmSync(plan.canonicalDir, { force: true });
  } else if (existing) {
    rmSync(plan.canonicalDir, { recursive: true, force: true });
  }

  symlinkSync(plan.snapshotName, plan.canonicalDir, 'dir');
  summary.finalDir = plan.writeDir;
  summary.symlinkPath = plan.canonicalDir;
  summary.symlinkTarget = plan.writeDir;
  return summary;
}

async function buildPlayerIndexes({
  tswId,
  tournamentName,
  startDate,
  endDate,
  draws,
  playerIdMap,
}) {
  let playersData;
  try {
    playersData = JSON.parse(await readFile(join(outDir, 'players.json'), 'utf-8'));
  } catch {
    return false;
  }
  const players = playersData.players || [];

  const detailEntries = new Map(
    players.map((player) => [
      player.playerId,
      {
        tswId,
        playerId: player.playerId,
        playerName: player.name,
        memberId: playerIdMap[player.playerId] || undefined,
        club: player.club || '',
        events: new Set(),
        matches: [],
        wins: 0,
        losses: 0,
        hasUpcomingMatches: false,
      },
    ]),
  );

  const scheduleEntries = new Map(
    players.map((player) => [
      player.playerId,
      {
        playerId: player.playerId,
        playerName: player.name,
        matches: [],
      },
    ]),
  );

  try {
    const matchFiles = (await readdir(join(outDir, 'matches'))).filter((fileName) => fileName.endsWith('.json')).sort();
    for (const fileName of matchFiles) {
      const dayData = JSON.parse(await readFile(join(outDir, 'matches', fileName), 'utf-8'));
      for (const match of dayData.matches || []) {
        const participantIds = [
          ...new Set([
            ...((match.team1Ids || []).filter(Boolean)),
            ...((match.team2Ids || []).filter(Boolean)),
          ]),
        ];

        for (const playerId of participantIds) {
          const detailEntry = detailEntries.get(playerId);
          if (!detailEntry) continue;

          detailEntry.matches.push(match);
          if (!match.bye) {
            const inTeam1 = (match.team1Ids || []).includes(playerId);
            if (inTeam1 && match.team1Won) detailEntry.wins += 1;
            else if (inTeam1 && match.team2Won) detailEntry.losses += 1;
            else if (!inTeam1 && match.team2Won) detailEntry.wins += 1;
            else if (!inTeam1 && match.team1Won) detailEntry.losses += 1;
          }

          const isUpcoming = !match.team1Won && !match.team2Won && !match.bye && !match.walkover && !!match.time;
          if (!isUpcoming) continue;

          detailEntry.hasUpcomingMatches = true;
          const scheduleEntry = scheduleEntries.get(playerId);
          if (!scheduleEntry) continue;

          const parsedTime = parseScheduledTime(match.time);
          const inTeam1 = (match.team1Ids || []).includes(playerId);
          const opponentNames = inTeam1 ? match.team2 : match.team1;
          const opponentIds = inTeam1 ? (match.team2Ids || []) : (match.team1Ids || []);
          const playerTeamNames = inTeam1 ? match.team1 : match.team2;
          const playerTeamIds = inTeam1 ? (match.team1Ids || []) : (match.team2Ids || []);
          const partnerNames = [];
          const partnerPlayerIds = [];

          for (let i = 0; i < playerTeamNames.length; i += 1) {
            if ((playerTeamIds[i] || null) !== playerId) {
              partnerNames.push(playerTeamNames[i]);
              partnerPlayerIds.push(playerTeamIds[i] ?? null);
            }
          }

          const drawObj = resolveDrawForEvent(draws, match.event || '');
          scheduleEntry.matches.push({
            date: parsedTime.date,
            dateLabel: parsedTime.dateLabel,
            event: match.event || '',
            round: match.round || '',
            time: parsedTime.time || match.time || '',
            court: match.court || '',
            drawType: classifyDrawType(drawObj?.type),
            status: (match.status || '').toLowerCase().includes('now') ? 'in-progress' : 'upcoming',
            opponent: { names: opponentNames, playerIds: opponentIds },
            partner: partnerNames.length > 0 ? { names: partnerNames, playerIds: partnerPlayerIds } : null,
            result: null,
            nextMatches: [],
            consolation: null,
            consolationMatches: [],
          });
        }
      }
    }
  } catch {
    // Matches are optional for partially scraped tournaments.
  }

  try {
    const eventFiles = (await readdir(join(outDir, 'event-details'))).filter((fileName) => fileName.endsWith('.json'));
    for (const fileName of eventFiles) {
      const eventData = JSON.parse(await readFile(join(outDir, 'event-details', fileName), 'utf-8'));
      for (const entry of eventData.entries || []) {
        for (const player of entry.players || []) {
          const detailEntry = detailEntries.get(player.playerId);
          if (!detailEntry) continue;
          const partners = (entry.players || [])
            .filter((candidate) => candidate.playerId !== player.playerId)
            .map((candidate) => candidate.name);
          const label = partners.length > 0
            ? `${eventData.eventName} with ${partners.join(' / ')}`
            : eventData.eventName;
          detailEntry.events.add(label);
        }
      }
    }
  } catch {
    // Event details are optional for partially scraped tournaments.
  }

  const playerDetailsById = Object.fromEntries(
    [...detailEntries.entries()].map(([playerId, entry]) => {
      const total = entry.wins + entry.losses;
      return [playerId, {
        tswId,
        playerId: entry.playerId,
        playerName: entry.playerName,
        memberId: entry.memberId,
        club: entry.club,
        events: [...entry.events].sort(),
        winLoss: total > 0
          ? { wins: entry.wins, losses: entry.losses, total, winPct: Math.round((entry.wins / total) * 100) }
          : null,
        matches: entry.matches,
        hasUpcomingMatches: entry.hasUpcomingMatches,
      }];
    }),
  );

  const playerScheduleById = Object.fromEntries(
    [...scheduleEntries.entries()].map(([playerId, entry]) => [playerId, {
      playerId: entry.playerId,
      playerName: entry.playerName,
      matches: entry.matches.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      }),
    }]),
  );

  await Promise.all([
    saveJson('player-detail-index.json', { tswId, playersById: playerDetailsById }),
    saveJson('player-schedule-index.json', {
      tswId,
      tournamentName,
      startDate,
      endDate,
      playersById: playerScheduleById,
    }),
  ]);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nScraping tournament ${tswId} directly from TSW`);
  console.log(`Output root: ${CACHE_ROOT}\n`);

  mkdirSync(CACHE_ROOT, { recursive: true });

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
  const { startDate, endDate } = parseTournamentDateRange(drawsHtml, info.dates);
  const finished = isTournamentFinished(endDate);
  const outputPlan = planOutput(tswId, endDate);
  outDir = outputPlan.writeDir;
  mkdirSync(outDir, { recursive: true });

  const detail = {
    tswId,
    name: info.name,
    dates: info.dates,
    startDate,
    endDate,
    location: info.location,
    draws,
    tswUrl: `https://www.tournamentsoftware.com/tournament/${tswId}`,
  };
  const eventsData = { tswId, eventCount: events.length, events };

  const tournamentName = detail.name || 'Unknown';
  const dates = detail.dates || '';
  const drawIds = draws.map(d => d.drawId);
  const eventIds = events.map(e => e.eventId);
  const dateParams = generateDateParams(startDate, endDate);

  console.log(`  Tournament: ${tournamentName}`);
  console.log(`  Dates: ${dates} (${startDate} to ${endDate})`);
  console.log(`  Finished: ${finished ? 'yes' : 'no'} (checked from end date only)`);
  console.log(`  Output mode: ${finished ? 'final folder' : 'timestamped snapshot + symlink'}`);
  console.log(`  Write dir: ${outDir}`);
  console.log(`  Canonical path: ${outputPlan.canonicalDir}`);
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

  const staticResults = await Promise.allSettled([
    (async () => {
      const resp = tswOk(await tswFetch(`/sport/seeds.aspx?id=${encodeURIComponent(tswId)}`), 'seeds page');
      const html = await resp.text();
      const seedEvents = parseTswSeeding(html);
      const data = { tswId, eventCount: seedEvents.length, events: seedEvents };
      await saveJson('seeds.json', data);
      return { name: 'seeds', data };
    })(),
    (async () => {
      const resp = tswOk(await tswFetch(`/tournament/${tswIdLower}/Players/GetPlayersContent`, {
        method: 'POST',
        extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${TSW_BASE}/tournament/${tswId}/players` },
        body: '',
      }), 'players content');
      const html = await resp.text();
      const players = parseTswTournamentPlayersArray(html);
      const data = { tswId, playerCount: players.length, players };
      await saveJson('players.json', data);
      return { name: 'players', data, playersMap: parseTswTournamentPlayers(html) };
    })(),
    (async () => {
      const resp = tswOk(await tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`), 'winners page');
      const html = await resp.text();
      const winnerEvents = parseTswWinners(html);
      const titleMatch = html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
      const tn = titleMatch
        ? titleMatch[1].replace(/^Tournamentsoftware\.com\s*-\s*/i, '').replace(/\s*-\s*Winners$/i, '').trim()
        : '';
      const data = { tswId, tournamentName: tn, events: winnerEvents };
      await saveJson('winners.json', data);
      return { name: 'winners', data, winnerEvents, tournamentName: tn };
    })(),
  ]);

  let playersMap = null;
  let winnerEvents = null;
  let winnersTournamentName = '';

  for (const result of staticResults) {
    if (result.status === 'fulfilled') {
      console.log(`  Saved: ${result.value.name}.json`);
      if (result.value.name === 'players') playersMap = result.value.playersMap;
      if (result.value.name === 'winners') {
        winnerEvents = result.value.winnerEvents;
        winnersTournamentName = result.value.tournamentName;
      }
    } else {
      console.warn(`  FAILED: ${result.reason.message}`);
    }
  }

  if (playersMap && winnerEvents) {
    const medals = winnerEvents.map((event) => {
      const { gold, silver, bronze, fourth } = normalizePlaces(event.results);
      const enrichPlayers = (entries) => entries.flatMap((resultEntries) =>
        resultEntries.players.map((player) => ({
          name: player.name,
          club: playersMap.get(player.playerId)?.club || '',
          playerId: player.playerId,
        })),
      );
      const enrichBronze = (entries) => entries.map((resultEntries) =>
        resultEntries.players.map((player) => ({
          name: player.name,
          club: playersMap.get(player.playerId)?.club || '',
          playerId: player.playerId,
        })),
      );
      const ageGroup = (event.eventName.match(/U\d+/i) || [''])[0].toUpperCase();
      const eventType = (event.eventName.match(/^(BS|GS|BD|GD|XD)/i) || [''])[0].toUpperCase();
      return {
        drawName: event.eventName,
        ageGroup,
        eventType,
        gold: enrichPlayers(gold),
        silver: enrichPlayers(silver),
        bronze: enrichBronze(bronze),
        fourth: enrichBronze(fourth),
      };
    });

    await saveJson('medals.json', {
      tswId,
      tournamentName: winnersTournamentName,
      clubs: buildClubStats(medals),
      medals,
    });
    console.log('  Saved: medals.json');
  }

  // Phase 4: fetch matches for each day
  let totalMatchCount = 0;
  if (dateParams.length > 0) {
    console.log('Phase 3: Fetching matches per day from TSW...');
    const MATCH_DAY_CONCURRENCY = Math.max(1, Number(process.env.TSW_MATCH_DAY_CONCURRENCY ?? 5));
    const matchResults = await runInBatches(dateParams, MATCH_DAY_CONCURRENCY, async (dp) => {
      const resp = tswOk(await tswFetch(
        `/tournament/${tswIdLower}/Matches/MatchesInDay?date=${encodeURIComponent(dp)}`,
      ), `matches ${dp}`);
      const html = await resp.text();
      const matches = parseTswMatches(html);
      const data = { tswId, date: formatMatchDate(dp), matches };
      await saveJson(`matches/${dp}.json`, data);
      return { dp, matchCount: matches.length };
    });
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

  console.log('Phase 7: Building tournament player indexes...');
  const builtIndexes = await buildPlayerIndexes({
    tswId,
    tournamentName,
    startDate,
    endDate,
    draws,
    playerIdMap,
  });
  if (builtIndexes) {
    console.log('  Saved: player-detail-index.json, player-schedule-index.json');
  } else {
    console.log('  Skipped: player indexes (players.json unavailable)');
  }

  // Phase 8: write manifest
  const staticFiles = [
    'detail.json',
    'draws.json',
    'events.json',
    'seeds.json',
    'players.json',
    'winners.json',
    'medals.json',
  ];
  if (builtIndexes) {
    staticFiles.push('player-detail-index.json', 'player-schedule-index.json');
  }
  if (flagAll) staticFiles.push('player-id-map.json');

  const manifest = {
    tswId,
    tournamentName,
    scrapedAt: new Date().toISOString(),
    startDate,
    endDate,
    finished,
    dateParams,
    drawIds,
    eventIds,
    playerIdMapIncluded: flagAll,
    mappedPlayerCount: Object.keys(playerIdMap).length,
    output: {
      mode: outputPlan.mode,
      canonicalDir: outputPlan.canonicalDir,
      writeDir: outDir,
      symlinkPath: outputPlan.mode === 'snapshot' ? outputPlan.canonicalDir : null,
    },
    files: {
      static: staticFiles,
      matches: dateParams.map(dp => `matches/${dp}.json`),
      drawBrackets: drawIds.map(id => `draw-brackets/${id}.json`),
      eventDetails: eventIds.map(id => `event-details/${id}.json`),
    },
  };
  saveJson('_manifest.json', manifest);
  console.log('\n  Saved: _manifest.json');

  const outputSummary = finalizeOutput(outputPlan);

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
  console.log(`  Finished   : ${finished ? 'yes' : 'no'} (end date only)`);
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
  console.log(`  Output mode: ${outputSummary.mode === 'final' ? 'final folder' : 'timestamped snapshot + symlink'}`);
  console.log(`  Write dir  : ${outputSummary.writeDir}`);
  if (outputSummary.symlinkPath && outputSummary.symlinkTarget) {
    console.log(`  Symlink    : ${outputSummary.symlinkPath} -> ${outputSummary.symlinkTarget}`);
  } else {
    console.log(`  Output     : ${outputSummary.finalDir}`);
  }
  if (outputSummary.replacedPathType) {
    console.log(`  Replaced   : existing ${outputSummary.replacedPathType} at ${outputSummary.canonicalDir}`);
  }
  if (outputSummary.previousLinkTarget) {
    console.log(`  Prev link  : ${outputSummary.previousLinkTarget}`);
  }
  if (outputSummary.removedSnapshotDir) {
    console.log(`  Removed    : ${outputSummary.removedSnapshotDir}`);
  }
  console.log(`  Total files: ${totalFiles}`);
  console.log(`  Folder size: ${folderSize}`);
  console.log(`  Canonical  : ${outputSummary.canonicalDir}`);
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
