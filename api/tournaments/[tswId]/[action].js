import {
  setCors, getCached, setCache,
  tswFetch, parseTswDrawsList, parseTswTournamentInfo,
  parseTswWinners, parseTswTournamentPlayers, parseTswTournamentPlayersArray,
  parseTswMatches, parseTswPlayerMatches, parseTswMatchDates, formatMatchDate,
  parseTswEliminationDraw, parseTswDrawType,
  isValidTswId,
  TSW_BASE,
} from '../../_lib/shared.js';

// ── Medals helpers ──────────────────────────────────────────────────────────

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
    .map(([club, s]) => ({
      club, gold: s.gold, silver: s.silver, bronze: s.bronze,
      total: s.gold + s.silver + s.bronze,
    }))
    .sort((a, b) => b.total - a.total || b.gold - a.gold || b.silver - a.silver);
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

// ── Action handlers ─────────────────────────────────────────────────────────

async function handleDetail(tswId, _req, res) {
  const cacheKey = `tournament-detail:${tswId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
    const drawsPath = `/sport/draws.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = await tswFetch(drawsPath);
    if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
    const html = await resp.text();

    const info = parseTswTournamentInfo(html);
    const draws = parseTswDrawsList(html);

    const result = {
      tswId,
      name: info.name,
      dates: info.dates,
      location: info.location,
      draws,
      tswUrl: `https://www.tournamentsoftware.com/tournament/${tswId}`,
    };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-detail] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleWinners(tswId, _req, res) {
  const cacheKey = `tournament-winners:${tswId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
    const winnersResp = await tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`);
    if (!winnersResp.ok) throw new Error(`Winners page HTTP ${winnersResp.status}`);
    const winnersHtml = await winnersResp.text();

    const titleMatch = winnersHtml.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
    const tournamentName = titleMatch
      ? titleMatch[1].replace(/^Tournamentsoftware\.com\s*-\s*/i, '').replace(/\s*-\s*Winners$/i, '').trim()
      : '';

    const events = parseTswWinners(winnersHtml);
    const result = { tswId, tournamentName, events };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-winners] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleMedals(tswId, _req, res) {
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

    for (const event of winnerEvents) {
      const ageGroup = getAgeGroup(event.eventName);
      const eventType = getEventType(event.eventName);
      const { gold, silver, bronze, fourth } = normalizePlaces(event.results);

      medals.push({
        drawName: event.eventName,
        ageGroup,
        eventType,
        gold: enrichPlayers(gold, playersMap),
        silver: enrichPlayers(silver, playersMap),
        bronze: enrichBronze(bronze, playersMap),
        fourth: enrichBronze(fourth, playersMap),
      });
    }

    const result = { tswId, tournamentName, clubs: buildClubStats(medals), medals };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-medals] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleMatches(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const dateParam = req.query?.d || urlObj.searchParams.get('d') || '';
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';

  if (!dateParam) {
    const datesCacheKey = `tournament-match-dates:${tswId}`;
    const cached = getCached(datesCacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify({ tswId, dates: cached }));
      return;
    }

    try {
      const parentResp = await tswFetch(`/sport/matches.aspx?id=${encodeURIComponent(tswId)}`);
      if (!parentResp.ok) throw new Error(`TSW matches page HTTP ${parentResp.status}`);
      const parentHtml = await parentResp.text();
      const dates = parseTswMatchDates(parentHtml);
      setCache(datesCacheKey, dates);

      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
      res.end(JSON.stringify({ tswId, dates }));
    } catch (err) {
      console.error('[tournament-matches] dates error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  const cacheKey = `tournament-matches-day:${tswId}:${dateParam}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify({ tswId, date: formatMatchDate(dateParam), matches: cached }));
      return;
    }
  }

  try {
    const matchResp = await tswFetch(
      `/tournament/${tswId.toLowerCase()}/Matches/MatchesInDay?date=${encodeURIComponent(dateParam)}`,
    );
    if (!matchResp.ok) throw new Error(`TSW matches AJAX HTTP ${matchResp.status}`);
    const matchHtml = await matchResp.text();
    const matches = parseTswMatches(matchHtml);
    setCache(cacheKey, matches);

    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify({ tswId, date: formatMatchDate(dateParam), matches }));
  } catch (err) {
    console.error('[tournament-matches] day error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Placeholder actions for future TSW tournament endpoints ─────────────────

async function handlePlayers(tswId, _req, res) {
  try {
    const cacheKey = `tournament-players:${tswId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

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
    const players = parseTswTournamentPlayersArray(html);
    const result = { tswId, playerCount: players.length, players };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-players] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleDraws(tswId, _req, res) {
  try {
    const cacheKey = `tournament-draws:${tswId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const drawsPath = `/sport/draws.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = await tswFetch(drawsPath);
    if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
    const html = await resp.text();
    const draws = parseTswDrawsList(html);
    const result = { tswId, drawCount: draws.length, draws };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-draws] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleEvents(tswId, _req, res) {
  try {
    const cacheKey = `tournament-events:${tswId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const drawsPath = `/sport/draws.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = await tswFetch(drawsPath);
    if (!resp.ok) throw new Error(`TSW HTTP ${resp.status}`);
    const html = await resp.text();
    const draws = parseTswDrawsList(html);

    const events = draws.map(d => ({
      drawId: d.drawId,
      name: d.name,
      ageGroup: getAgeGroup(d.name),
      eventType: getEventType(d.name),
    }));
    const result = { tswId, eventCount: events.length, events };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-events] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handlePlayerDetail(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const playerId = req.query?.playerId || urlObj.searchParams.get('playerId');
  if (!playerId || !/^\d+$/.test(playerId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'playerId query parameter required (numeric)' }));
    return;
  }

  const cacheKey = `tournament-player-detail:${tswId}:${playerId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
    const playerPath = `/tournament/${tswId.toLowerCase()}/player/${playerId}`;
    const resp = await tswFetch(playerPath);
    if (!resp.ok) throw new Error(`TSW player page HTTP ${resp.status}`);
    const html = await resp.text();

    // Player name from <h4 class="media__title ..."><a ...><span>Name</span></a></h4>
    const nameMatch = html.match(/<h4[^>]*class="[^"]*media__title[^"]*"[^>]*>([\s\S]*?)<\/h4>/i);
    let playerName = '';
    let memberId = '';
    if (nameMatch) {
      const valMatch = nameMatch[1].match(/nav-link__value">([^<]+)<\/span>/);
      if (valMatch) playerName = valMatch[1].trim();
      const asideMatch = nameMatch[1].match(/media__title-aside[^>]*>\s*\((\d+)\)/);
      if (asideMatch) memberId = asideMatch[1];
    }

    const club = '';

    // Events + partners from media__subheading-wrapper (player-level)
    const events = [];
    const wrapperMatch = html.match(/<div class="media__subheading-wrapper">([\s\S]*?)<\/div>/i);
    if (wrapperMatch) {
      const evRegex = /nav-link__value">([^<]+)<\/span>/g;
      let em;
      while ((em = evRegex.exec(wrapperMatch[1])) !== null) {
        events.push(em[1].trim());
      }
    }

    // Win-loss from progress-bar-container
    let winLoss = null;
    const wlMatch = html.match(/<span class="flex-item">(\d+)-(\d+)\s*\((\d+)\)<\/span>/);
    const pctMatch = html.match(/aria-valuenow="(\d+)"/);
    if (wlMatch) {
      winLoss = {
        wins: parseInt(wlMatch[1], 10),
        losses: parseInt(wlMatch[2], 10),
        total: parseInt(wlMatch[3], 10),
        winPct: pctMatch ? parseInt(pctMatch[1], 10) : 0,
      };
    }

    const matches = parseTswPlayerMatches(html);

    const result = {
      tswId,
      playerId: parseInt(playerId, 10),
      playerName,
      memberId: memberId || undefined,
      club,
      events,
      winLoss,
      matches,
    };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-player-detail] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleDrawBracket(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const drawId = req.query?.drawId || urlObj.searchParams.get('drawId');
  if (!drawId || !/^\d+$/.test(drawId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'drawId query parameter required (numeric)' }));
    return;
  }

  const cacheKey = `tournament-draw-bracket:${tswId}:${drawId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    res.end(JSON.stringify(cached));
    return;
  }

  try {
    const drawPath = `/tournament/${tswId.toLowerCase()}/draw/${drawId}`;
    const resp = await tswFetch(drawPath);
    if (!resp.ok) throw new Error(`TSW draw page HTTP ${resp.status}`);
    const html = await resp.text();

    const drawType = parseTswDrawType(html);
    const sections = parseTswEliminationDraw(html);

    const result = { tswId, drawId: parseInt(drawId, 10), drawType, sections };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[tournament-draw-bracket] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

const ACTIONS = {
  detail: handleDetail,
  winners: handleWinners,
  medals: handleMedals,
  matches: handleMatches,
  players: handlePlayers,
  draws: handleDraws,
  events: handleEvents,
  'player-detail': handlePlayerDetail,
  'draw-bracket': handleDrawBracket,
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const tswId = req.query?.tswId || req.url?.match(/\/tournaments\/([^/?]+)/)?.[1];
  if (!tswId || !isValidTswId(tswId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tswId parameter required' }));
    return;
  }

  const action = req.query?.action || req.url?.match(/\/tournaments\/[^/?]+\/([^/?]+)/)?.[1] || 'detail';
  const actionHandler = ACTIONS[action];
  if (!actionHandler) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown action: ${action}`, validActions: Object.keys(ACTIONS) }));
    return;
  }

  await actionHandler(tswId, req, res);
}
