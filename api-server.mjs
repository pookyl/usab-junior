/**
 * Lightweight proxy API server that fetches and parses data from
 * usabjrrankings.org and tournamentsoftware.com server-side,
 * avoiding any browser CORS/DOMParser issues.
 * Runs on port 3001 alongside the Vite dev server.
 */
import { createServer } from 'http';
import { URL } from 'url';
import { readFile, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';

import {
  USAB_BASE, TSW_BASE, TSW_ORG_CODE, BROWSER_HEADERS,
  getCached, setCache,
  fetchWithRetry,
  parseRankings, parsePlayerGender, parsePlayerDetail,
  parseH2HContent,
  tswFetch,
  isValidDate, isValidAgeGroup, isValidEventType, isValidUsabId, isValidSeason,
} from './api/_lib/shared.js';
import {
  listCachedDates,
  loadDiskCacheForDate,
  getDiskCachedRankings,
  getDiskCachedAllPlayers,
  getDiskCachedDate,
  saveDiskCache,
} from './api/_lib/rankingsDiskCache.js';
import {
  sendJson,
  sendApiError,
  ValidationError,
  UpstreamError,
  UnavailableError,
} from './api/_lib/http.js';

const PORT = process.env.PORT || 3001;
const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function getDefaultDate() {
  const dates = await listCachedDates();
  if (dates[0]) return dates[0];
  const diskDate = await getDiskCachedDate();
  if (diskDate && isValidDate(diskDate)) return diskDate;
  return new Date().toISOString().slice(0, 10);
}

// ── Tournament cache (serves pre-scraped data from tournament-cache/) ────────

const TOURNAMENT_CACHE_DIR = join(__dirname, 'data', 'tournament-cache');

const CACHE_ACTION_MAP = {
  detail: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'detail.json'),
  draws: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'draws.json'),
  events: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'events.json'),
  seeds: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'seeds.json'),
  players: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'players.json'),
  winners: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'winners.json'),
  medals: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'medals.json'),
  matches: (tswId, url) => {
    const d = url.searchParams.get('d') || '';
    return d ? join(TOURNAMENT_CACHE_DIR, tswId, 'matches', `${d}.json`) : null;
  },
  'draw-bracket': (tswId, url) => {
    const drawId = url.searchParams.get('drawId') || '';
    return drawId ? join(TOURNAMENT_CACHE_DIR, tswId, 'draw-brackets', `${drawId}.json`) : null;
  },
  'event-detail': (tswId, url) => {
    const eventId = url.searchParams.get('eventId') || '';
    return eventId ? join(TOURNAMENT_CACHE_DIR, tswId, 'event-details', `${eventId}.json`) : null;
  },
};

async function serveTournamentCache(tswId, action, url) {
  if (action === 'player-detail') {
    return synthesizePlayerDetail(tswId, url);
  }
  if (action === 'player-schedule') {
    return synthesizePlayerSchedule(tswId, url);
  }

  const resolver = CACHE_ACTION_MAP[action];
  if (!resolver) return null;

  const filePath = resolver(tswId, url);
  if (!filePath) return null;

  try {
    const data = await readFile(filePath, 'utf-8');
    console.log(`[tournament-cache] serving ${action} for ${tswId} from disk`);
    return data;
  } catch {
    return null;
  }
}

async function synthesizePlayerDetail(tswId, url) {
  const playerId = parseInt(url.searchParams.get('playerId') || '', 10);
  if (!playerId) return null;

  const cacheDir = join(TOURNAMENT_CACHE_DIR, tswId);

  let playersData;
  try {
    playersData = JSON.parse(await readFile(join(cacheDir, 'players.json'), 'utf-8'));
  } catch {
    return null;
  }

  const player = (playersData.players || []).find(p => p.playerId === playerId);
  if (!player) return null;

  // Collect matches across all days
  const allMatches = [];
  try {
    const matchFiles = await readdir(join(cacheDir, 'matches'));
    for (const f of matchFiles) {
      if (!f.endsWith('.json')) continue;
      const dayData = JSON.parse(await readFile(join(cacheDir, 'matches', f), 'utf-8'));
      for (const m of dayData.matches || []) {
        const inTeam1 = (m.team1Ids || []).includes(playerId);
        const inTeam2 = (m.team2Ids || []).includes(playerId);
        if (inTeam1 || inTeam2) allMatches.push(m);
      }
    }
  } catch { /* no matches dir */ }

  // Compute win/loss
  let wins = 0;
  let losses = 0;
  for (const m of allMatches) {
    const inTeam1 = (m.team1Ids || []).includes(playerId);
    if (m.bye) continue;
    if (inTeam1 && m.team1Won) wins++;
    else if (inTeam1 && m.team2Won) losses++;
    else if (!inTeam1 && m.team2Won) wins++;
    else if (!inTeam1 && m.team1Won) losses++;
  }
  const total = wins + losses;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;

  // Find events from event-details
  const events = [];
  try {
    const eventFiles = await readdir(join(cacheDir, 'event-details'));
    for (const f of eventFiles) {
      if (!f.endsWith('.json')) continue;
      const evData = JSON.parse(await readFile(join(cacheDir, 'event-details', f), 'utf-8'));
      for (const entry of evData.entries || []) {
        const playerInEntry = (entry.players || []).some(p => p.playerId === playerId);
        if (!playerInEntry) continue;
        const partners = (entry.players || [])
          .filter(p => p.playerId !== playerId)
          .map(p => p.name);
        const label = partners.length > 0
          ? `${evData.eventName} with ${partners.join(' / ')}`
          : evData.eventName;
        if (!events.includes(label)) events.push(label);
      }
    }
  } catch { /* no event-details dir */ }

  let memberId;
  try {
    const idMap = JSON.parse(await readFile(join(cacheDir, 'player-id-map.json'), 'utf-8'));
    memberId = idMap[String(playerId)] || undefined;
  } catch { /* no map file */ }

  const hasUpcomingMatches = allMatches.some(m => !m.team1Won && !m.team2Won && !m.bye && !m.walkover && m.time);
  const result = {
    tswId,
    playerId,
    playerName: player.name,
    memberId,
    club: player.club || '',
    events,
    winLoss: total > 0 ? { wins, losses, total, winPct } : null,
    matches: allMatches,
    hasUpcomingMatches,
  };

  console.log(`[tournament-cache] synthesized player-detail for ${player.name} (${playerId}): ${allMatches.length} matches, ${events.length} events`);
  return JSON.stringify(result);
}

async function synthesizePlayerSchedule(tswId, url) {
  const rawIds = url.searchParams.get('playerIds') || '';
  const playerIds = rawIds.split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
  if (playerIds.length === 0) return null;

  const cacheDir = join(TOURNAMENT_CACHE_DIR, tswId);

  // Phase 1: Read detail.json for draws list + tournament info, and players for name resolution
  let detailData;
  try {
    detailData = JSON.parse(await readFile(join(cacheDir, 'detail.json'), 'utf-8'));
  } catch {
    try {
      const manifest = JSON.parse(await readFile(join(cacheDir, '_manifest.json'), 'utf-8'));
      detailData = { name: manifest.tournamentName || '', dates: manifest.dates || '', draws: [] };
    } catch { return null; }
  }

  let playersData;
  try {
    playersData = JSON.parse(await readFile(join(cacheDir, 'players.json'), 'utf-8'));
  } catch { return null; }

  const playerMap = new Map((playersData.players || []).map(p => [p.playerId, p]));
  const players = playerIds
    .filter(id => playerMap.has(id))
    .map(id => ({ playerId: id, playerName: playerMap.get(id).name }));
  if (players.length === 0) return null;

  const drawsList = detailData.draws || [];
  const tournamentName = (detailData.name || '').replace(/^Tournamentsoftware\.com\s*-\s*/i, '').replace(/\s*-\s*Draws$/i, '');

  const dateRangeMatch = (detailData.dates || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let startDate = '', endDate = '';
  if (dateRangeMatch) {
    const [, sM, sD, sY, eM, eD, eY] = dateRangeMatch;
    startDate = `${sY}-${sM.padStart(2, '0')}-${sD.padStart(2, '0')}`;
    endDate = `${eY}-${eM.padStart(2, '0')}-${eD.padStart(2, '0')}`;
  }

  // Phase 2: Read match files, filter to upcoming (unfinished) player matches.
  // No date filtering — cached data may be from past tournament days that still
  // have unfinished matches at scrape time.
  const allUpcoming = [];
  try {
    const matchFiles = await readdir(join(cacheDir, 'matches'));
    for (const f of matchFiles.sort()) {
      if (!f.endsWith('.json')) continue;
      const dp = f.replace('.json', '');
      const dayData = JSON.parse(await readFile(join(cacheDir, 'matches', f), 'utf-8'));
      for (const m of dayData.matches || []) {
        for (const pid of playerIds) {
          const inTeam1 = (m.team1Ids || []).includes(pid);
          const inTeam2 = (m.team2Ids || []).includes(pid);
          if (!inTeam1 && !inTeam2) continue;
          if (m.team1Won || m.team2Won || m.bye || m.walkover) continue;
          allUpcoming.push({ ...m, _playerId: pid, _dateParam: dp });
        }
      }
    }
  } catch { /* no matches dir */ }

  // Map upcoming event names to draws from the draws list (no event-detail files needed)
  const upcomingEventNames = new Set(allUpcoming.map(m => m.event).filter(Boolean));
  const eventToDrawObj = new Map();
  for (const eventName of upcomingEventNames) {
    const exact = drawsList.find(d => d.name === eventName);
    if (exact) { eventToDrawObj.set(eventName, exact); continue; }
    const prefixed = drawsList.find(d =>
      d.name.startsWith(eventName) && !/consolation/i.test(d.name) && !/play-?off/i.test(d.name),
    );
    if (prefixed) eventToDrawObj.set(eventName, prefixed);
  }

  // Phase 3: Load brackets only for elimination draws with upcoming matches
  const bracketCache = new Map();
  for (const [, drawObj] of eventToDrawObj) {
    const t = (drawObj.type || '').toLowerCase();
    if (!t.includes('elimination')) continue;
    if (bracketCache.has(drawObj.drawId)) continue;
    try {
      bracketCache.set(drawObj.drawId, JSON.parse(await readFile(join(cacheDir, 'draw-brackets', `${drawObj.drawId}.json`), 'utf-8')));
    } catch { bracketCache.set(drawObj.drawId, null); }
  }

  function getRoundName(section, level) {
    const rounds = section.rounds || [];
    if (rounds.length === 0) return `Round ${level}`;
    const hasWinner = rounds[rounds.length - 1].toLowerCase() === 'winner';
    const finalIdx = hasWinner ? rounds.length - 2 : rounds.length - 1;
    const idx = finalIdx - (level - 1);
    if (idx >= 0 && idx < rounds.length) {
      const name = rounds[idx];
      if (name && !/^(club|state)$/i.test(name)) return name;
    }
    return `Round ${level}`;
  }

  function findPotentialNextMatches(bracket, playerId) {
    if (!bracket || bracket.drawType !== 'elimination') return [];
    for (const section of bracket.sections || []) {
      let deepestWinLevel = Infinity, deepestWinNum = 0;
      for (const bm of section.matches || []) {
        if (!bm.winner) continue;
        if (bm.winner.playerId !== playerId && bm.winner.partnerPlayerId !== playerId) continue;
        if (bm.roundLevel < deepestWinLevel) { deepestWinLevel = bm.roundLevel; deepestWinNum = bm.matchNum; }
      }
      if (deepestWinLevel === Infinity) {
        const entry = (section.entries || []).find(e => e.playerId === playerId || e.partnerPlayerId === playerId);
        if (!entry) continue;
        const maxRL = Math.max(...(section.matches || []).map(m => m.roundLevel), 0);
        if (maxRL === 0) continue;
        deepestWinLevel = maxRL + 1;
        deepestWinNum = Math.ceil(entry.position / 2);
      }
      const currentLevel = deepestWinLevel - 1;
      if (currentLevel < 1) continue;
      const currentNum = Math.ceil(deepestWinNum / 2);
      const currentMatchId = `${currentLevel}${String(currentNum).padStart(3, '0')}`;
      const currentMatch = (section.matches || []).find(m => m.matchId === currentMatchId);
      if (currentMatch?.winner) {
        const isPlayer = currentMatch.winner.playerId === playerId || currentMatch.winner.partnerPlayerId === playerId;
        if (!isPlayer) continue;
      }
      const results = [];
      let prevNum = currentNum;
      for (let level = currentLevel - 1; level >= 1; level--) {
        const levelNum = Math.ceil(prevNum / 2);
        const matchId = `${level}${String(levelNum).padStart(3, '0')}`;
        const bracketMatch = (section.matches || []).find(m => m.matchId === matchId);
        if (!bracketMatch?.scheduledTime) break;
        const roundName = getRoundName(section, level);
        let opponent = null;
        const otherNum = prevNum % 2 === 0 ? prevNum - 1 : prevNum + 1;
        const otherId = `${level + 1}${String(otherNum).padStart(3, '0')}`;
        const otherFeeder = (section.matches || []).find(m => m.matchId === otherId);
        if (otherFeeder?.winner) {
          const w = otherFeeder.winner;
          const names = [w.name]; const ids = [w.playerId];
          if (w.partner) { names.push(w.partner); ids.push(w.partnerPlayerId ?? null); }
          opponent = { names, playerIds: ids };
        }
        results.push({ round: roundName, time: bracketMatch.scheduledTime || '', court: '', date: '', dateLabel: '', opponent });
        prevNum = levelNum;
      }
      return results;
    }
    return [];
  }

  function findConsolationPath(bracket, playerId, mainCurrentLevel, mainCurrentNum, consolationType) {
    if (!bracket || bracket.drawType !== 'elimination') return null;
    const mainSection = (bracket.sections || [])[0];
    if (!mainSection) return null;
    const consSection = (bracket.sections || []).find(s => s.name && s.name.toLowerCase().includes('consolation'));
    if (!consSection || !(consSection.matches || []).length) return null;
    const mainMaxRL = Math.max(...mainSection.matches.map(m => m.roundLevel));
    const consMaxRL = Math.max(...consSection.matches.map(m => m.roundLevel));
    const consEntryRL = consMaxRL - (mainMaxRL - mainCurrentLevel);
    if (consEntryRL < 1 || consEntryRL > consMaxRL) return null;
    if (/first match/i.test(consolationType || '') && consEntryRL !== consMaxRL) return null;
    const countAtEntry = (consSection.matches || []).filter(m => m.roundLevel === consEntryRL).length;
    const countAbove = (consSection.matches || []).filter(m => m.roundLevel === consEntryRL + 1).length;
    const isFeedIn = consEntryRL === consMaxRL || countAtEntry > Math.ceil(countAbove / 2);
    if (!isFeedIn) return null;
    const isHighest = consEntryRL === consMaxRL;
    const consEntryMN = isHighest ? mainCurrentNum : mainCurrentNum * 2;
    const sectionLabel = consSection.name.replace(/^[^-]*-\s*/, '') || 'Consolation';
    const matches = [];
    let prevNum = consEntryMN;
    for (let level = consEntryRL; level >= 1; level--) {
      const levelNum = level === consEntryRL ? prevNum : Math.ceil(prevNum / 2);
      const matchId = `${level}${String(levelNum).padStart(3, '0')}`;
      const bm = (consSection.matches || []).find(m => m.matchId === matchId);
      if (!bm?.scheduledTime) { prevNum = levelNum; continue; }
      const roundName = getRoundName(consSection, level);
      let opponent = null;
      if (level < consEntryRL) {
        const otherNum = prevNum % 2 === 0 ? prevNum - 1 : prevNum + 1;
        const otherId = `${level + 1}${String(otherNum).padStart(3, '0')}`;
        const otherFeeder = (consSection.matches || []).find(m => m.matchId === otherId);
        if (otherFeeder?.winner) {
          const w = otherFeeder.winner;
          const names = [w.name]; const ids = [w.playerId];
          if (w.partner) { names.push(w.partner); ids.push(w.partnerPlayerId ?? null); }
          opponent = { names, playerIds: ids };
        }
      }
      matches.push({ round: `Consolation ${roundName}`, time: bm.scheduledTime || '', court: '', date: '', dateLabel: '', opponent });
      prevNum = levelNum;
    }
    return { section: sectionLabel, matches };
  }

  function findConsolationPlayoffPath(bracket, playerId) {
    if (!bracket || bracket.drawType !== 'elimination') return null;
    const consSection = (bracket.sections || []).find(s => s.name && /consolation/i.test(s.name) && !/play-?off/i.test(s.name));
    if (!consSection) return null;
    let deepestWinLevel = Infinity, deepestWinNum = 0;
    for (const bm of consSection.matches || []) {
      if (!bm.winner) continue;
      if (bm.winner.playerId !== playerId && bm.winner.partnerPlayerId !== playerId) continue;
      if (bm.roundLevel < deepestWinLevel) { deepestWinLevel = bm.roundLevel; deepestWinNum = bm.matchNum; }
    }
    if (deepestWinLevel === Infinity) return null;
    if (deepestWinLevel - 1 !== 2) return null;
    const currentNum = Math.ceil(deepestWinNum / 2);
    const consPlayoffSection = (bracket.sections || []).find(s => s.name && /consolation/i.test(s.name) && /play-?off\s*3\/?4/i.test(s.name));
    if (!consPlayoffSection || !(consPlayoffSection.matches || []).length) return null;
    const sectionLabel = consPlayoffSection.name.replace(/^[^-]*-\s*/, '') || 'Consolation Play-off 3/4';
    const finalMatch = (consPlayoffSection.matches || []).find(m => m.matchId === '1001');
    const roundName = '3rd/4th Place';
    let opponent = null;
    const otherSlotId = `2${String(currentNum === 1 ? 2 : 1).padStart(3, '0')}`;
    const otherSlot = (consPlayoffSection.matches || []).find(m => m.matchId === otherSlotId);
    if (otherSlot?.winner) {
      const w = otherSlot.winner;
      const names = [w.name]; const ids = [w.playerId];
      if (w.partner) { names.push(w.partner); ids.push(w.partnerPlayerId ?? null); }
      opponent = { names, playerIds: ids };
    }
    const matches = [];
    if (finalMatch) matches.push({ round: roundName, time: finalMatch.scheduledTime || '', court: '', date: '', dateLabel: '', opponent });
    return { section: sectionLabel, matches };
  }

  function findPlayoffPath(bracket, playerId, mainCurrentLevel, mainCurrentNum) {
    if (!bracket || bracket.drawType !== 'elimination') return null;
    if (mainCurrentLevel !== 2) return null;
    const playoffSection = (bracket.sections || []).find(s => s.name && /play-?off\s*3\/?4/i.test(s.name));
    if (!playoffSection || !(playoffSection.matches || []).length) return null;
    const sectionLabel = playoffSection.name.replace(/^[^-]*-\s*/, '') || 'Play-off 3/4';
    const finalMatch = (playoffSection.matches || []).find(m => m.matchId === '1001');
    const roundName = '3rd/4th Place';
    let opponent = null;
    const otherSlotId = `2${String(mainCurrentNum === 1 ? 2 : 1).padStart(3, '0')}`;
    const otherSlot = (playoffSection.matches || []).find(m => m.matchId === otherSlotId);
    if (otherSlot?.winner) {
      const w = otherSlot.winner;
      const names = [w.name]; const ids = [w.playerId];
      if (w.partner) { names.push(w.partner); ids.push(w.partnerPlayerId ?? null); }
      opponent = { names, playerIds: ids };
    }
    const matches = [];
    if (finalMatch) matches.push({ round: roundName, time: finalMatch.scheduledTime || '', court: '', date: '', dateLabel: '', opponent });
    return { section: sectionLabel, matches };
  }

  function computeConsolationInfo(bracket, playerId, roundName, consolationType) {
    let consolation = null, consolationMatches = [];
    if (/3rd\/4th|3rd.4th|play-?off/i.test(roundName || '')) return { consolation, consolationMatches };
    const isConsMatch = /consolation/i.test(roundName || '');
    if (isConsMatch) {
      if (/semi/i.test(roundName || '')) {
        const consPath = findConsolationPlayoffPath(bracket, playerId);
        if (consPath) { consolation = consPath.section; consolationMatches = consPath.matches; }
      }
    } else {
      const mainSection = (bracket.sections || [])[0];
      if (mainSection) {
        let deepestWinLevel = Infinity, deepestWinNum = 0;
        for (const bm of mainSection.matches || []) {
          if (!bm.winner) continue;
          if (bm.winner.playerId !== playerId && bm.winner.partnerPlayerId !== playerId) continue;
          if (bm.roundLevel < deepestWinLevel) { deepestWinLevel = bm.roundLevel; deepestWinNum = bm.matchNum; }
        }
        if (deepestWinLevel === Infinity) {
          const entry = (mainSection.entries || []).find(e => e.playerId === playerId || e.partnerPlayerId === playerId);
          if (entry) { const maxRL = Math.max(...mainSection.matches.map(mm => mm.roundLevel), 0); deepestWinLevel = maxRL + 1; deepestWinNum = Math.ceil(entry.position / 2); }
        }
        if (deepestWinLevel !== Infinity) {
          const currentLevel = deepestWinLevel - 1, currentNum = Math.ceil(deepestWinNum / 2);
          if (currentLevel >= 1) {
            let consPath = findConsolationPath(bracket, playerId, currentLevel, currentNum, consolationType) || findPlayoffPath(bracket, playerId, currentLevel, currentNum);
            if (!consPath && /semi/i.test(roundName || '')) consPath = findPlayoffPath(bracket, playerId, 2, currentNum);
            if (consPath) { consolation = consPath.section; consolationMatches = consPath.matches; }
          }
        }
      }
    }
    return { consolation, consolationMatches };
  }

  function formatDateLabel(dp) {
    if (!dp || dp.length !== 8) return '';
    const d = new Date(`${dp.slice(0, 4)}-${dp.slice(4, 6)}-${dp.slice(6, 8)}T00:00:00`);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatDateIso(dp) {
    return dp?.length === 8 ? `${dp.slice(0, 4)}-${dp.slice(4, 6)}-${dp.slice(6, 8)}` : '';
  }

  // Phase 4: Build schedule grouped by date
  const dayMap = new Map();
  for (const m of allUpcoming) {
    const pid = m._playerId;
    const dp = m._dateParam;
    const dateKey = formatDateIso(dp);

    const inTeam1 = (m.team1Ids || []).includes(pid);
    const opponentNames = inTeam1 ? m.team2 : m.team1;
    const opponentIds = inTeam1 ? (m.team2Ids || []) : (m.team1Ids || []);
    const playerTeamNames = inTeam1 ? m.team1 : m.team2;
    const playerTeamIds = inTeam1 ? (m.team1Ids || []) : (m.team2Ids || []);

    const partnerNames = [];
    const partnerPlayerIds = [];
    for (let i = 0; i < playerTeamNames.length; i++) {
      if ((playerTeamIds[i] || null) !== pid) {
        partnerNames.push(playerTeamNames[i]);
        partnerPlayerIds.push(playerTeamIds[i] ?? null);
      }
    }

    let status = 'upcoming';
    if ((m.status || '').toLowerCase().includes('now')) status = 'in-progress';

    const drawObj = eventToDrawObj.get(m.event);
    const drawType = drawObj
      ? ((drawObj.type || '').toLowerCase().includes('elimination') ? 'elimination'
        : (drawObj.type || '').toLowerCase().includes('round') ? 'round-robin' : 'unknown')
      : 'unknown';

    let nextMatches = [];
    let consolation = null;
    let consolationMatches = [];

    if (drawType === 'elimination' && drawObj) {
      const bracket = bracketCache.get(drawObj.drawId);
      if (bracket) {
        nextMatches = findPotentialNextMatches(bracket, pid);
        const consInfo = computeConsolationInfo(bracket, pid, m.round, drawObj.consolation);
        consolation = consInfo.consolation;
        consolationMatches = consInfo.consolationMatches;
      }
    }

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { date: dateKey, dateLabel: formatDateLabel(dp), matches: [] });
    }
    dayMap.get(dateKey).matches.push({
      playerId: pid,
      event: m.event || '',
      round: m.round || '',
      time: m.time || '',
      court: m.court || '',
      drawType,
      status,
      opponent: { names: opponentNames, playerIds: opponentIds },
      partner: partnerNames.length > 0 ? { names: partnerNames, playerIds: partnerPlayerIds } : null,
      result: null,
      nextMatches,
      consolation,
      consolationMatches,
    });
  }

  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const result = { tswId, tournamentName, startDate, endDate, players, days };
  const matchCount = days.reduce((sum, d) => sum + d.matches.length, 0);
  console.log(`[tournament-cache] synthesized player-schedule for ${players.map(p => p.playerName).join(', ')}: ${matchCount} matches across ${days.length} days`);
  return JSON.stringify(result);
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

  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    const defaultDate = await getDefaultDate();

  // GET /api/rankings?age_group=U13&category=BS&date=2026-03-01
  if (reqUrl.pathname === '/api/rankings') {
    const ageGroup = reqUrl.searchParams.get('age_group') ?? 'U11';
    const eventType = reqUrl.searchParams.get('category') ?? 'BS';
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    if (!isValidAgeGroup(ageGroup)) {
      return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
    }
    if (!isValidEventType(eventType)) {
      return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
    }
    if (!isValidDate(date)) {
      return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));
    }
    const cacheKey = `rankings:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const diskKey = `${ageGroup}-${eventType}`;
    const perDateDisk = await getDiskCachedRankings(diskKey, date);
    if (perDateDisk) {
      console.log(`[rankings] serving from per-date disk cache for ${diskKey} date=${date}`);
      setCache(cacheKey, perDateDisk);
      res.writeHead(200, { 'X-Cache': 'DISK' });
      res.end(JSON.stringify(perDateDisk));
      return;
    }

    try {
      const url = `${USAB_BASE}/?age_group=${encodeURIComponent(ageGroup)}&category=${encodeURIComponent(eventType)}&date=${encodeURIComponent(date)}`;
      console.log(`[rankings] fetching ${url}`);
      const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
      if (!response.ok) throw new UpstreamError(`USAB rankings HTTP ${response.status}`);
      const html = await response.text();
      const players = parseRankings(html, ageGroup, eventType);
      console.log(`[rankings] parsed ${players.length} players for ${ageGroup} ${eventType}`);
      setCache(cacheKey, players);
      sendJson(res, 200, players, { 'X-Cache': 'MISS' });
    } catch (err) {
      console.error(`[rankings] error:`, err.message);
      const diskData = await getDiskCachedRankings(diskKey);
      if (diskData) {
        console.log(`[rankings] serving from disk cache for ${diskKey}`);
        sendJson(res, 200, diskData, { 'X-Cache': 'DISK' });
      } else {
        sendApiError(res, new UnavailableError('No data available'));
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
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    if (!isValidUsabId(usabId)) {
      return sendApiError(res, new ValidationError('Invalid player ID format', { field: 'id' }));
    }
    if (!isValidAgeGroup(ageGroup)) {
      return sendApiError(res, new ValidationError('Invalid age_group', { field: 'age_group' }));
    }
    if (!isValidEventType(eventType)) {
      return sendApiError(res, new ValidationError('Invalid category', { field: 'category' }));
    }
    if (!isValidDate(date)) {
      return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));
    }
    const cacheKey = `player:${usabId}:${ageGroup}:${eventType}:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const url = `${USAB_BASE}/${encodeURIComponent(usabId)}/details?age_group=${encodeURIComponent(ageGroup)}&category=${encodeURIComponent(eventType)}&date=${encodeURIComponent(date)}`;
      console.log(`[player] fetching ${url}`);
      const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
      if (!response.ok) throw new UpstreamError(`USAB player detail HTTP ${response.status}`);
      const html = await response.text();
      const history = parsePlayerDetail(html);
      const gender = parsePlayerGender(html);
      console.log(`[player] parsed ${history.length} tournament entries for USAB ${usabId}, gender=${gender}`);
      const result = { gender, entries: history };
      setCache(cacheKey, result);
      sendJson(res, 200, result, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'player' });
    }
    return;
  }

  // GET /api/h2h?player1=446477&player2=530254
  if (reqUrl.pathname === '/api/h2h') {
    const p1 = reqUrl.searchParams.get('player1');
    const p2 = reqUrl.searchParams.get('player2');
    if (!p1 || !p2) {
      return sendApiError(res, new ValidationError('player1 and player2 query params required'));
    }
    if (!isValidUsabId(p1) || !isValidUsabId(p2)) {
      return sendApiError(res, new ValidationError('Invalid player ID format'));
    }
    const cacheKey = `h2h:${[p1, p2].sort().join(':')}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const path = `/head-2-head/Head2HeadContent?OrganizationCode=${TSW_ORG_CODE}&t1p1memberid=${encodeURIComponent(p1)}&t2p1memberid=${encodeURIComponent(p2)}`;
      console.log(`[h2h] fetching ${TSW_BASE}${path}`);
      const resp = await tswFetch(path);
      if (!resp.ok) throw new UpstreamError(`TSW HTTP ${resp.status}`);
      const html = await resp.text();
      const data = parseH2HContent(html, resp.headers);
      console.log(`[h2h] parsed ${data.matches.length} matches, score ${data.team1wins}-${data.team2wins}`);
      setCache(cacheKey, data);
      sendJson(res, 200, data, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'h2h' });
    }
    return;
  }

  // GET /api/tournaments?season=2025-2026
  if (reqUrl.pathname === '/api/tournaments') {
    const season = reqUrl.searchParams.get('season');
    if (season && !isValidSeason(season)) {
      return sendApiError(res, new ValidationError('Invalid season format', { field: 'season' }));
    }
    const cacheKey = `tournaments:${season || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    try {
      const tournamentDir = join(__dirname, 'data');
      const availableSeasons = [];
      if (existsSync(tournamentDir)) {
        for (const f of await readdir(tournamentDir)) {
          const m = f.match(/^tournaments-(\d{4}-\d{4})\.json$/);
          if (m) availableSeasons.push(m[1]);
        }
      }
      availableSeasons.sort().reverse();

      if (availableSeasons.length === 0) {
        sendJson(res, 200, { seasons: {}, availableSeasons: [] });
        return;
      }

      const REGION_TIME_ZONES = {
        NW: 'America/Los_Angeles',
        NorCal: 'America/Los_Angeles',
        SoCal: 'America/Los_Angeles',
        MW: 'America/Chicago',
        South: 'America/Chicago',
        NE: 'America/New_York',
        National: 'America/New_York',
      };
      const STATE_TIME_ZONES = {
        AL: 'America/Chicago',
        AK: 'America/Anchorage',
        AZ: 'America/Phoenix',
        AR: 'America/Chicago',
        CA: 'America/Los_Angeles',
        CO: 'America/Denver',
        CT: 'America/New_York',
        DE: 'America/New_York',
        FL: 'America/New_York',
        GA: 'America/New_York',
        HI: 'Pacific/Honolulu',
        ID: 'America/Denver',
        IL: 'America/Chicago',
        IN: 'America/Indiana/Indianapolis',
        IA: 'America/Chicago',
        KS: 'America/Chicago',
        KY: 'America/New_York',
        LA: 'America/Chicago',
        ME: 'America/New_York',
        MD: 'America/New_York',
        MA: 'America/New_York',
        MI: 'America/Detroit',
        MN: 'America/Chicago',
        MS: 'America/Chicago',
        MO: 'America/Chicago',
        MT: 'America/Denver',
        NE: 'America/Chicago',
        NV: 'America/Los_Angeles',
        NH: 'America/New_York',
        NJ: 'America/New_York',
        NM: 'America/Denver',
        NY: 'America/New_York',
        NC: 'America/New_York',
        ND: 'America/Chicago',
        OH: 'America/New_York',
        OK: 'America/Chicago',
        OR: 'America/Los_Angeles',
        PA: 'America/New_York',
        RI: 'America/New_York',
        SC: 'America/New_York',
        SD: 'America/Chicago',
        TN: 'America/Chicago',
        TX: 'America/Chicago',
        UT: 'America/Denver',
        VT: 'America/New_York',
        VA: 'America/New_York',
        WA: 'America/Los_Angeles',
        WV: 'America/New_York',
        WI: 'America/Chicago',
        WY: 'America/Denver',
        DC: 'America/New_York',
      };
      const STATE_NAME_TO_CODE = {
        Alabama: 'AL',
        Alaska: 'AK',
        Arizona: 'AZ',
        Arkansas: 'AR',
        California: 'CA',
        Colorado: 'CO',
        Connecticut: 'CT',
        Delaware: 'DE',
        Florida: 'FL',
        Georgia: 'GA',
        Hawaii: 'HI',
        Idaho: 'ID',
        Illinois: 'IL',
        Indiana: 'IN',
        Iowa: 'IA',
        Kansas: 'KS',
        Kentucky: 'KY',
        Louisiana: 'LA',
        Maine: 'ME',
        Maryland: 'MD',
        Massachusetts: 'MA',
        Michigan: 'MI',
        Minnesota: 'MN',
        Mississippi: 'MS',
        Missouri: 'MO',
        Montana: 'MT',
        Nebraska: 'NE',
        Nevada: 'NV',
        'New Hampshire': 'NH',
        'New Jersey': 'NJ',
        'New Mexico': 'NM',
        'New York': 'NY',
        'North Carolina': 'NC',
        'North Dakota': 'ND',
        Ohio: 'OH',
        Oklahoma: 'OK',
        Oregon: 'OR',
        Pennsylvania: 'PA',
        'Rhode Island': 'RI',
        'South Carolina': 'SC',
        'South Dakota': 'SD',
        Tennessee: 'TN',
        Texas: 'TX',
        Utah: 'UT',
        Vermont: 'VT',
        Virginia: 'VA',
        Washington: 'WA',
        'West Virginia': 'WV',
        Wisconsin: 'WI',
        Wyoming: 'WY',
        'District of Columbia': 'DC',
      };
      const dateFormatterByTimeZone = new Map();

      function getDateFormatter(timeZone) {
        if (!dateFormatterByTimeZone.has(timeZone)) {
          dateFormatterByTimeZone.set(
            timeZone,
            new Intl.DateTimeFormat('en-US', {
              timeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }),
          );
        }
        return dateFormatterByTimeZone.get(timeZone);
      }

      function todayInTimeZone(timeZone) {
        try {
          const formatter = getDateFormatter(timeZone);
          const parts = formatter.formatToParts(new Date());
          const year = parts.find((p) => p.type === 'year')?.value;
          const month = parts.find((p) => p.type === 'month')?.value;
          const day = parts.find((p) => p.type === 'day')?.value;
          if (year && month && day) return `${year}-${month}-${day}`;
        } catch {
          // Fall back to UTC date below.
        }
        return new Date().toISOString().slice(0, 10);
      }

      function extractStateCode(location) {
        if (!location) return null;
        const text = String(location).replace(/\./g, '').trim();
        const postalMatches = [...text.matchAll(/,\s*([A-Z]{2})(?=(?:\s+\d{5}(?:-\d{4})?)?(?:,|$))/g)];
        for (let i = postalMatches.length - 1; i >= 0; i--) {
          const code = postalMatches[i][1];
          if (STATE_TIME_ZONES[code]) return code;
        }
        for (const [stateName, code] of Object.entries(STATE_NAME_TO_CODE)) {
          if (new RegExp(`\\b${stateName.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)) {
            return code;
          }
        }
        return null;
      }

      function getTournamentTimeZone(tournament) {
        const stateCode = extractStateCode(tournament.venueLocation);
        if (stateCode) return STATE_TIME_ZONES[stateCode];
        return REGION_TIME_ZONES[tournament.region] || 'UTC';
      }

      function recomputeStatuses(tournaments) {
        const todayByTimeZone = new Map();
        return tournaments.map(t => {
          if (!t.startDate) return { ...t, status: 'upcoming' };
          const end = t.endDate || t.startDate;
          const timeZone = getTournamentTimeZone(t);
          if (!todayByTimeZone.has(timeZone)) {
            todayByTimeZone.set(timeZone, todayInTimeZone(timeZone));
          }
          const today = todayByTimeZone.get(timeZone);
          let status;
          if (today > end) status = 'completed';
          else if (today >= t.startDate) status = 'in-progress';
          else status = 'upcoming';
          return { ...t, status };
        });
      }

      async function loadSeason(s) {
        if (!isValidSeason(s)) return null;
        try {
          const raw = await readFile(join(tournamentDir, `tournaments-${s}.json`), 'utf-8');
          return JSON.parse(raw);
        } catch { return null; }
      }

      let result;
      let allTournaments = [];
      if (season) {
        const data = await loadSeason(season);
        const list = data ? recomputeStatuses(data.tournaments) : [];
        allTournaments = list;
        result = {
          season,
          tournaments: list,
          availableSeasons,
        };
      } else {
        const allSeasons = {};
        for (const s of availableSeasons) {
          const data = await loadSeason(s);
          if (data) {
            const list = recomputeStatuses(data.tournaments);
            allSeasons[s] = { tournaments: list };
            allTournaments.push(...list);
          }
        }
        result = { seasons: allSeasons, availableSeasons };
      }

      // Pick spotlight: in-progress > closest to today (upcoming or recently completed)
      const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
      const inProgress = allTournaments.filter(t => t.status === 'in-progress');
      let spotlight = null;
      if (inProgress.length > 0) {
        spotlight = inProgress[0];
      } else {
        const completed = allTournaments
          .filter(t => t.status === 'completed' && t.endDate)
          .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
        const upcoming = allTournaments
          .filter(t => t.status === 'upcoming' && t.startDate)
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        const recentCompleted = completed[0] ?? null;
        const nextUpcoming = upcoming[0] ?? null;
        if (recentCompleted && nextUpcoming) {
          const completedGap = todayMs - new Date(recentCompleted.endDate).getTime();
          const upcomingGap = new Date(nextUpcoming.startDate).getTime() - todayMs;
          spotlight = upcomingGap <= completedGap ? nextUpcoming : recentCompleted;
        } else {
          spotlight = nextUpcoming ?? recentCompleted;
        }
      }
      result.spotlight = spotlight;

      setCache(cacheKey, result);
      console.log(`[tournaments] serving ${season || 'all'} (${availableSeasons.length} seasons available)`);
      sendJson(res, 200, result, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'tournaments' });
    }
    return;
  }

  // GET /api/tournaments/:tswId/:action — unified tournament action dispatcher
  const tournamentActionMatch = reqUrl.pathname.match(/^\/api\/tournaments\/([0-9A-Fa-f-]+)\/([a-z][-a-z]*)$/);
  if (tournamentActionMatch) {
    const tswId = tournamentActionMatch[1];
    const action = tournamentActionMatch[2];

    const refresh = reqUrl.searchParams.get('refresh') === '1';
    if (!refresh) {
      const cachedResponse = await serveTournamentCache(tswId, action, reqUrl);
      if (cachedResponse) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Source': 'cache' });
        res.end(cachedResponse);
        return;
      }
    }

    const { default: actionHandler } = await import('./api/tournaments/[tswId]/[action].js');
    req.query = {
      tswId,
      action,
      d: reqUrl.searchParams.get('d') || '',
      refresh: reqUrl.searchParams.get('refresh') || '',
      playerId: reqUrl.searchParams.get('playerId') || '',
      playerIds: reqUrl.searchParams.get('playerIds') || '',
    };
    await actionHandler(req, res);
    return;
  }

  // GET /api/cached-dates  – returns dates that have per-date cache files on disk
  if (reqUrl.pathname === '/api/cached-dates') {
    const dates = await listCachedDates();
    console.log(`[cached-dates] found ${dates.length} cached date files`);
    sendJson(res, 200, { dates });
    return;
  }

  // GET /api/player-directory — cumulative directory of all players across all dates
  if (reqUrl.pathname === '/api/player-directory') {
    const cacheKey = 'player-directory';
    const cached = getCached(cacheKey);
    if (cached) {
      sendJson(res, 200, cached, { 'X-Cache': 'HIT' });
      return;
    }

    try {
      const dates = (await listCachedDates()).sort();
      const playerMap = new Map();

      for (const date of dates) {
        const disk = await loadDiskCacheForDate(date);
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
      sendJson(res, 200, directory, { 'X-Cache': 'MISS' });
    } catch (err) {
      sendApiError(res, err, { logLabel: 'player-directory' });
    }
    return;
  }

  // GET /api/all-players?date=2026-03-01
  if (reqUrl.pathname === '/api/all-players') {
    const date = reqUrl.searchParams.get('date') ?? defaultDate;
    if (!isValidDate(date)) {
      return sendApiError(res, new ValidationError('Invalid date format', { field: 'date' }));
    }
    const cacheKey = `all-players:${date}`;

    const cached = getCached(cacheKey);
    if (cached) {
      sendJson(res, 200, cached, { 'X-Cache': 'HIT', 'X-Partial': 'false' });
      return;
    }

    const perDateDisk = await getDiskCachedAllPlayers(date);
    if (perDateDisk) {
      console.log(`[all-players] serving from per-date disk cache for ${date}`);
      setCache(cacheKey, perDateDisk.players);
      sendJson(res, 200, perDateDisk.players, { 'X-Cache': 'DISK', 'X-Partial': 'false' });
      return;
    }

    const ageGroups = ['U11', 'U13', 'U15', 'U17', 'U19'];
    const eventTypes = ['BS', 'GS', 'BD', 'GD', 'XD'];
    const allPlayers = new Map();
    const rankingsByCategory = {};
    let fetchedFromWeb = false;
    const failedCategories = [];

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

          const url = `${USAB_BASE}/?age_group=${encodeURIComponent(ag)}&category=${encodeURIComponent(et)}&date=${encodeURIComponent(date)}`;
          const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          const players = parseRankings(html, ag, et);
          setCache(rankCacheKey, players);
          return { players, ag, et, fromWeb: true };
        }),
      );

      for (const [idx, result] of results.entries()) {
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
        } else {
          const failed = batch[idx];
          if (failed) failedCategories.push(`${failed.ag}-${failed.et}`);
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
        await saveDiskCache(date, rankingsByCategory, uniquePlayers);
      }

      const partial = failedCategories.length > 0;
      const headers = {
        'X-Cache': 'MISS',
        'X-Partial': partial ? 'true' : 'false',
      };
      if (partial) {
        headers['X-Failed-Categories'] = failedCategories.join(',');
      }
      sendJson(res, 200, uniquePlayers, headers);
    } else {
      const diskData = await getDiskCachedAllPlayers();
      if (diskData) {
        console.log(`[all-players] website returned no data, serving from disk cache (date ${diskData.date})`);
        sendJson(res, 200, diskData.players, { 'X-Cache': 'DISK', 'X-Partial': 'false' });
      } else {
        sendApiError(res, new UnavailableError('No data available'));
      }
    }
    return;
  }

  // GET /api/player/:id/tsw-stats or /api/player/:id/ranking-trend
  const playerActionMatch = reqUrl.pathname.match(/^\/api\/player\/(\d+)\/(tsw-stats|ranking-trend)$/);
  if (playerActionMatch) {
    const { default: actionHandler } = await import('./api/player/[id]/[action].js');
    req.query = { ...Object.fromEntries(reqUrl.searchParams), id: playerActionMatch[1], action: playerActionMatch[2] };
    await actionHandler(req, res);
    return;
  }

  // ── Serve static files from dist/ (production build) ─────────────────────
  const distDir = resolve(__dirname, 'dist');

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

    const filePath = resolve(distDir, normalize(reqUrl.pathname === '/' ? 'index.html' : '.' + reqUrl.pathname));

    if (!filePath.startsWith(distDir)) {
      sendJson(res, 403, { error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        const mime = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
        const content = await readFile(filePath);
        res.setHeader('Content-Type', mime);
        res.writeHead(200);
        res.end(content);
        return;
      }
    } catch { /* file doesn't exist — fall through to SPA index */ }

    const indexPath = join(distDir, 'index.html');
    try {
      const content = await readFile(indexPath);
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(content);
      return;
    } catch { /* no index.html */ }
  }

    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  } catch (err) {
    if (res.writableEnded) {
      console.error('[api-server] uncaught error after response:', err);
      return;
    }
    sendApiError(res, err, { logLabel: 'api-server' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Rankings API  →  http://localhost:${PORT}\n`);
});
