import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

const TOURNAMENT_CACHE_DIR = join(process.cwd(), 'data', 'tournament-cache');

const DISK_CACHE_ACTION_MAP = {
  detail: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'detail.json'),
  draws: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'draws.json'),
  events: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'events.json'),
  seeds: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'seeds.json'),
  players: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'players.json'),
  winners: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'winners.json'),
  medals: (tswId) => join(TOURNAMENT_CACHE_DIR, tswId, 'medals.json'),
  matches: (tswId, q) => {
    const day = q.d || '';
    return day ? join(TOURNAMENT_CACHE_DIR, tswId, 'matches', `${day}.json`) : null;
  },
  'draw-bracket': (tswId, q) => {
    const drawId = q.drawId || '';
    return drawId ? join(TOURNAMENT_CACHE_DIR, tswId, 'draw-brackets', `${drawId}.json`) : null;
  },
  'event-detail': (tswId, q) => {
    const eventId = q.eventId || '';
    return eventId ? join(TOURNAMENT_CACHE_DIR, tswId, 'event-details', `${eventId}.json`) : null;
  },
};

export function getTournamentCacheDir() {
  return TOURNAMENT_CACHE_DIR;
}

export async function serveTournamentDiskCache(tswId, action, queryParams) {
  if (action === 'player-detail') return synthesizePlayerDetail(tswId, queryParams);
  if (action === 'player-schedule') return synthesizePlayerSchedule(tswId, queryParams);

  const resolver = DISK_CACHE_ACTION_MAP[action];
  if (!resolver) return null;

  const filePath = resolver(tswId, queryParams);
  if (!filePath) return null;

  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function synthesizePlayerDetail(tswId, queryParams) {
  const playerId = parseInt(queryParams.playerId || '', 10);
  if (!playerId) return null;

  const cacheDir = join(TOURNAMENT_CACHE_DIR, tswId);
  try {
    const indexed = JSON.parse(await readFile(join(cacheDir, 'player-detail-index.json'), 'utf-8'));
    const indexedPlayer = indexed.playersById?.[String(playerId)] ?? indexed.playersById?.[playerId];
    if (indexedPlayer) {
      return JSON.stringify(indexedPlayer);
    }
  } catch {
    // Fall back to the older synthesized path.
  }

  let playersData;
  try {
    playersData = JSON.parse(await readFile(join(cacheDir, 'players.json'), 'utf-8'));
  } catch {
    return null;
  }

  const player = (playersData.players || []).find((item) => item.playerId === playerId);
  if (!player) return null;

  const allMatches = [];
  try {
    const matchFiles = await readdir(join(cacheDir, 'matches'));
    for (const fileName of matchFiles) {
      if (!fileName.endsWith('.json')) continue;
      const dayData = JSON.parse(await readFile(join(cacheDir, 'matches', fileName), 'utf-8'));
      for (const match of dayData.matches || []) {
        if ((match.team1Ids || []).includes(playerId) || (match.team2Ids || []).includes(playerId)) {
          allMatches.push(match);
        }
      }
    }
  } catch {
    // Matches are optional for partially scraped tournaments.
  }

  let wins = 0;
  let losses = 0;
  for (const match of allMatches) {
    if (match.bye) continue;
    const inTeam1 = (match.team1Ids || []).includes(playerId);
    if (inTeam1 && match.team1Won) wins += 1;
    else if (inTeam1 && match.team2Won) losses += 1;
    else if (!inTeam1 && match.team2Won) wins += 1;
    else if (!inTeam1 && match.team1Won) losses += 1;
  }
  const total = wins + losses;

  const events = [];
  try {
    const eventFiles = await readdir(join(cacheDir, 'event-details'));
    for (const fileName of eventFiles) {
      if (!fileName.endsWith('.json')) continue;
      const eventData = JSON.parse(await readFile(join(cacheDir, 'event-details', fileName), 'utf-8'));
      for (const entry of eventData.entries || []) {
        if (!(entry.players || []).some((candidate) => candidate.playerId === playerId)) continue;
        const partners = (entry.players || [])
          .filter((candidate) => candidate.playerId !== playerId)
          .map((candidate) => candidate.name);
        const label = partners.length > 0
          ? `${eventData.eventName} with ${partners.join(' / ')}`
          : eventData.eventName;
        if (!events.includes(label)) events.push(label);
      }
    }
  } catch {
    // Event details are optional for partially scraped tournaments.
  }

  let memberId;
  try {
    const idMap = JSON.parse(await readFile(join(cacheDir, 'player-id-map.json'), 'utf-8'));
    memberId = idMap[String(playerId)] || undefined;
  } catch {
    // Member IDs are optional.
  }

  const hasUpcomingMatches = allMatches.some(
    (match) => !match.team1Won && !match.team2Won && !match.bye && !match.walkover && match.time,
  );

  return JSON.stringify({
    tswId,
    playerId,
    playerName: player.name,
    memberId,
    club: player.club || '',
    events,
    winLoss: total > 0
      ? { wins, losses, total, winPct: Math.round((wins / total) * 100) }
      : null,
    matches: allMatches,
    hasUpcomingMatches,
  });
}

async function synthesizePlayerSchedule(tswId, queryParams) {
  const rawIds = queryParams.playerIds || '';
  const playerIds = rawIds.split(',').map((item) => parseInt(item.trim(), 10)).filter(Number.isFinite);
  if (playerIds.length === 0) return null;

  const cacheDir = join(TOURNAMENT_CACHE_DIR, tswId);
  try {
    const indexed = JSON.parse(await readFile(join(cacheDir, 'player-schedule-index.json'), 'utf-8'));
    const players = playerIds
      .map((playerId) => indexed.playersById?.[String(playerId)] ?? indexed.playersById?.[playerId] ?? null)
      .filter(Boolean);

    if (players.length > 0) {
      const matchesByDate = new Map();
      for (const player of players) {
        for (const match of player.matches || []) {
          const dateKey = match.date || 'unknown';
          if (!matchesByDate.has(dateKey)) {
            matchesByDate.set(dateKey, { dateLabel: match.dateLabel || '', matches: [] });
          }
          matchesByDate.get(dateKey).matches.push({
            playerId: player.playerId,
            ...match,
          });
        }
      }

      const days = [...matchesByDate.entries()]
        .filter(([date]) => date !== 'unknown')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, data]) => ({ date, dateLabel: data.dateLabel, matches: data.matches }));
      const unknownDay = matchesByDate.get('unknown');
      if (unknownDay?.matches.length) {
        days.push({ date: '', dateLabel: '', matches: unknownDay.matches });
      }

      return JSON.stringify({
        tswId,
        tournamentName: indexed.tournamentName || '',
        startDate: indexed.startDate || '',
        endDate: indexed.endDate || '',
        players: players.map((player) => ({
          playerId: player.playerId,
          playerName: player.playerName,
        })),
        days,
      });
    }
  } catch {
    // Fall back to the older synthesized path.
  }

  let detailData;
  try {
    detailData = JSON.parse(await readFile(join(cacheDir, 'detail.json'), 'utf-8'));
  } catch {
    try {
      const manifest = JSON.parse(await readFile(join(cacheDir, '_manifest.json'), 'utf-8'));
      detailData = { name: manifest.tournamentName || '', dates: manifest.dates || '', draws: [] };
    } catch {
      return null;
    }
  }

  let playersData;
  try {
    playersData = JSON.parse(await readFile(join(cacheDir, 'players.json'), 'utf-8'));
  } catch {
    return null;
  }

  const playerMap = new Map((playersData.players || []).map((player) => [player.playerId, player]));
  const players = playerIds
    .filter((playerId) => playerMap.has(playerId))
    .map((playerId) => ({ playerId, playerName: playerMap.get(playerId).name }));
  if (players.length === 0) return null;

  const tournamentName = (detailData.name || '')
    .replace(/^Tournamentsoftware\.com\s*-\s*/i, '')
    .replace(/\s*-\s*Draws$/i, '');

  const dateRangeMatch = (detailData.dates || '').match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  );
  let startDate = '';
  let endDate = '';
  if (dateRangeMatch) {
    const [, sM, sD, sY, eM, eD, eY] = dateRangeMatch;
    startDate = `${sY}-${sM.padStart(2, '0')}-${sD.padStart(2, '0')}`;
    endDate = `${eY}-${eM.padStart(2, '0')}-${eD.padStart(2, '0')}`;
  }

  const allUpcoming = [];
  try {
    const matchFiles = await readdir(join(cacheDir, 'matches'));
    for (const fileName of matchFiles.sort()) {
      if (!fileName.endsWith('.json')) continue;
      const dayParam = fileName.replace('.json', '');
      const dayData = JSON.parse(await readFile(join(cacheDir, 'matches', fileName), 'utf-8'));
      for (const match of dayData.matches || []) {
        for (const playerId of playerIds) {
          const inTeam1 = (match.team1Ids || []).includes(playerId);
          const inTeam2 = (match.team2Ids || []).includes(playerId);
          if (!inTeam1 && !inTeam2) continue;
          if (match.team1Won || match.team2Won || match.bye || match.walkover) continue;
          allUpcoming.push({ ...match, _playerId: playerId, _dateParam: dayParam });
        }
      }
    }
  } catch {
    // Matches are optional for partially scraped tournaments.
  }

  function parseTime(timeStr, dateParam) {
    if (!timeStr && !dateParam) return { date: '', time: '', dateLabel: '' };
    const match = (timeStr || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    if (match) {
      const date = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      const dateValue = new Date(`${date}T00:00:00`);
      return {
        date,
        time: match[4].trim(),
        dateLabel: isNaN(dateValue.getTime())
          ? ''
          : dateValue.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      };
    }
    // Disk-cached match day files store time without date; derive from filename (YYYYMMDD).
    if (dateParam && /^\d{8}$/.test(dateParam)) {
      const date = `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}`;
      const dateValue = new Date(`${date}T00:00:00`);
      return {
        date,
        time: timeStr || '',
        dateLabel: isNaN(dateValue.getTime())
          ? ''
          : dateValue.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      };
    }
    return { date: '', time: timeStr || '', dateLabel: '' };
  }

  const matchesByDate = new Map();
  for (const match of allUpcoming) {
    const playerId = match._playerId;
    const parsed = parseTime(match.time, match._dateParam);
    const dateKey = parsed.date || 'unknown';
    const inTeam1 = (match.team1Ids || []).includes(playerId);
    if (!inTeam1 && !(match.team2Ids || []).includes(playerId)) continue;

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

    let status = 'upcoming';
    if ((match.status || '').toLowerCase().includes('now')) status = 'in-progress';

    if (!matchesByDate.has(dateKey)) {
      matchesByDate.set(dateKey, { dateLabel: parsed.dateLabel || '', matches: [] });
    }
    matchesByDate.get(dateKey).matches.push({
      playerId,
      event: match.event || '',
      round: match.round || '',
      time: parsed.time || match.time || '',
      court: match.court || '',
      drawType: 'unknown',
      status,
      opponent: { names: opponentNames, playerIds: opponentIds },
      partner: partnerNames.length > 0 ? { names: partnerNames, playerIds: partnerPlayerIds } : null,
      result: null,
      nextMatches: [],
      consolation: null,
      consolationMatches: [],
    });
  }

  const days = [...matchesByDate.entries()]
    .filter(([date]) => date !== 'unknown')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, data]) => ({ date, dateLabel: data.dateLabel, matches: data.matches }));
  const unknownDay = matchesByDate.get('unknown');
  if (unknownDay?.matches.length) {
    days.push({ date: '', dateLabel: '', matches: unknownDay.matches });
  }

  return JSON.stringify({ tswId, tournamentName, startDate, endDate, players, days });
}
