import {
  setCors, getCached, setCache,
  tswFetch, parseTswWinners, parseTswTournamentPlayers,
  parseTswTournamentInfo, isValidTswId,
} from '../../_lib/shared.js';

import { TSW_BASE } from '../../_lib/shared.js';

function getAgeGroup(eventName) {
  const m = eventName.match(/U\d+/i);
  return m ? m[0].toUpperCase() : '';
}

function getEventType(eventName) {
  const m = eventName.match(/^(BS|GS|BD|GD|XD)/i);
  return m ? m[1].toUpperCase() : '';
}

function normalizePlaces(results) {
  const gold = [], silver = [], bronze = [];
  for (const r of results) {
    const p = r.place.replace(/\s/g, '');
    if (p === '1') gold.push(r);
    else if (p === '1/2') { (gold.length === 0 ? gold : silver).push(r); }
    else if (p === '2') silver.push(r);
    else if (p === '3' || p === '3/4' || p === '4') bronze.push(r);
  }
  if (gold.length === 0 && results.length > 0) gold.push(results[0]);
  if (silver.length === 0 && results.length > 1) silver.push(results[1]);
  if (bronze.length === 0 && results.length > 2) bronze.push(results[2]);
  if (results.length > 3 && bronze.length < 2) {
    const r3 = results[3];
    if (r3 && !bronze.includes(r3)) bronze.push(r3);
  }
  return { gold, silver, bronze };
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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const tswId = req.query?.tswId || req.url?.match(/\/tournaments\/([^/?]+)\/medals/)?.[1];
  if (!tswId || !isValidTswId(tswId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tswId parameter required' }));
    return;
  }

  const cacheKey = `tournament-medals:${tswId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
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

    const clubStats = new Map();
    const clubPlayers = new Map();
    const medals = [];

    function enrichPlayers(resultEntries, pMap) {
      return resultEntries.flatMap(r =>
        r.players.map(p => {
          const entry = pMap.get(p.playerId);
          return { name: p.name, club: entry?.club || '', playerId: p.playerId };
        }),
      );
    }

    function enrichBronze(resultEntries, pMap) {
      return resultEntries.map(r =>
        r.players.map(p => {
          const entry = pMap.get(p.playerId);
          return { name: p.name, club: entry?.club || '', playerId: p.playerId };
        }),
      );
    }

    function countMedal(players, medalType, stats) {
      for (const p of players) {
        const club = p.club || 'N/A';
        if (!stats.has(club)) stats.set(club, { gold: 0, silver: 0, bronze: 0 });
        stats.get(club)[medalType]++;
      }
    }

    for (const event of winnerEvents) {
      const ageGroup = getAgeGroup(event.eventName);
      const eventType = getEventType(event.eventName);
      const { gold, silver, bronze } = normalizePlaces(event.results);

      const goldPlayers = enrichPlayers(gold, playersMap);
      const silverPlayers = enrichPlayers(silver, playersMap);
      const bronzePlayers = enrichBronze(bronze, playersMap);

      medals.push({
        drawName: event.eventName,
        ageGroup,
        eventType,
        gold: goldPlayers,
        silver: silverPlayers,
        bronze: bronzePlayers,
      });

      countMedal(goldPlayers, 'gold', clubStats);
      countMedal(silverPlayers, 'silver', clubStats);
      for (const team of bronzePlayers) countMedal(team, 'bronze', clubStats);
    }

    for (const [, info] of playersMap) {
      const club = info.club || 'N/A';
      if (!clubPlayers.has(club)) clubPlayers.set(club, new Set());
      clubPlayers.get(club).add(info.name);
    }

    const clubs = [...clubStats.entries()]
      .map(([club, stats]) => {
        const names = clubPlayers.get(club);
        const sorted = names ? [...names].sort((a, b) => a.localeCompare(b)) : [];
        return {
          club,
          gold: stats.gold,
          silver: stats.silver,
          bronze: stats.bronze,
          total: stats.gold + stats.silver + stats.bronze,
          playerCount: sorted.length,
          players: sorted,
        };
      })
      .sort((a, b) => b.total - a.total || b.gold - a.gold || b.silver - a.silver);

    for (const [club, players] of clubPlayers) {
      if (!clubStats.has(club)) {
        const sorted = [...players].sort((a, b) => a.localeCompare(b));
        clubs.push({
          club, gold: 0, silver: 0, bronze: 0, total: 0,
          playerCount: sorted.length,
          players: sorted,
        });
      }
    }

    const result = {
      tswId,
      tournamentName,
      clubs,
      medals,
    };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-medals] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
