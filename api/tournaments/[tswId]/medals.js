import {
  setCors, getCached, setCache,
  tswFetch, parseTswWinners, parseTswTournamentPlayers,
  parseTswTournamentInfo, isValidTswId,
  loadMedalsDiskCache,
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

  // Check disk cache (pre-scraped by scripts/refresh-medals-cache.mjs)
  const diskCached = await loadMedalsDiskCache(tswId);
  if (diskCached) {
    setCache(cacheKey, diskCached);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'DISK' });
    res.end(JSON.stringify(diskCached));
    return;
  }

  // Live scrape fallback (no USAB ID resolution — client falls back to name matching)
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
    const medals = [];

    function enrichPlayers(resultEntries, pMap) {
      return resultEntries.flatMap(r =>
        r.players.map(p => {
          const entry = pMap.get(p.playerId);
          return { name: p.name, club: entry?.club || '', playerId: p.playerId, usabId: '' };
        }),
      );
    }

    function enrichBronze(resultEntries, pMap) {
      return resultEntries.map(r =>
        r.players.map(p => {
          const entry = pMap.get(p.playerId);
          return { name: p.name, club: entry?.club || '', playerId: p.playerId, usabId: '' };
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
      const { gold, silver, bronze, fourth } = normalizePlaces(event.results);

      const goldPlayers = enrichPlayers(gold, playersMap);
      const silverPlayers = enrichPlayers(silver, playersMap);
      const bronzePlayers = enrichBronze(bronze, playersMap);
      const fourthPlayers = enrichBronze(fourth, playersMap);

      medals.push({
        drawName: event.eventName,
        ageGroup,
        eventType,
        gold: goldPlayers,
        silver: silverPlayers,
        bronze: bronzePlayers,
        fourth: fourthPlayers,
      });

      countMedal(goldPlayers, 'gold', clubStats);
      countMedal(silverPlayers, 'silver', clubStats);
      for (const team of bronzePlayers) countMedal(team, 'bronze', clubStats);
      for (const team of fourthPlayers) countMedal(team, 'bronze', clubStats);
    }

    const clubs = [...clubStats.entries()]
      .map(([club, stats]) => ({
        club,
        gold: stats.gold,
        silver: stats.silver,
        bronze: stats.bronze,
        total: stats.gold + stats.silver + stats.bronze,
      }))
      .sort((a, b) => b.total - a.total || b.gold - a.gold || b.silver - a.silver);

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
