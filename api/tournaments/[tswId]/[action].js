import {
  setCors, getCached, setCache,
  tswFetch, parseTswDrawsList, parseTswTournamentInfo,
  parseTswWinners, parseTswTournamentPlayers, parseTswTournamentPlayersArray,
  parseTswSeeding,
  parseTswEvents, parseTswEventDetail,
  parseTswMatches, parseTswPlayerMatches, formatMatchDate,
  parseTswEliminationDraw, parseTswDrawType,
  parseTswRoundRobinGroups, parseTswRoundRobinGroupName,
  parseTswRoundRobinStandings, parseTswRoundRobinMatches,
  parseTswPlayerInfo, parseTswPlayerEvents, parseTswPlayerWinLoss,
  isValidTswId, isValidTswDayParam,
  TSW_BASE,
} from '../../_lib/shared.js';
import {
  sendApiError,
  UpstreamError,
  ValidationError,
} from '../../_lib/http.js';

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
  tswOk(resp, 'Players content');
  const html = await resp.text();
  return parseTswTournamentPlayers(html);
}

function tswOk(resp, label) {
  if (!resp.ok) throw new UpstreamError(`${label} HTTP ${resp.status}`);
  return resp;
}

function sendError(res, err, label) {
  sendApiError(res, err, { logLabel: label });
}

function isRefreshRequest(req) {
  const urlObj = new URL(req.url, 'http://localhost');
  return req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';
}

// ── Action handlers ─────────────────────────────────────────────────────────

async function handleDetail(tswId, _req, res) {
  const refresh = isRefreshRequest(_req);
  const cacheKey = `tournament-detail:${tswId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }
  }

  try {
    const drawsPath = `/sport/draws.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = tswOk(await tswFetch(drawsPath), 'TSW draws page');
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
    sendError(res, err, 'tournament-detail');
  }
}

async function handleWinners(tswId, _req, res) {
  const refresh = isRefreshRequest(_req);
  const cacheKey = `tournament-winners:${tswId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }
  }

  try {
    const winnersResp = tswOk(await tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`), 'Winners page');
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
    sendError(res, err, 'tournament-winners');
  }
}

async function handleMedals(tswId, _req, res) {
  const refresh = isRefreshRequest(_req);
  const cacheKey = `tournament-medals:${tswId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }
  }

  try {
    const [winnersResp, playersMap] = await Promise.all([
      tswFetch(`/sport/winners.aspx?id=${encodeURIComponent(tswId)}`),
      fetchTournamentPlayers(tswId),
    ]);

    tswOk(winnersResp, 'Winners page');
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
    sendError(res, err, 'tournament-medals');
  }
}

async function handleMatches(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const dateParam = req.query?.d || urlObj.searchParams.get('d') || '';
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';

  if (!dateParam) {
    return sendApiError(res, new ValidationError('d query parameter required (YYYYMMDD)', { field: 'd' }));
  }

  if (!isValidTswDayParam(dateParam)) {
    return sendApiError(res, new ValidationError('d query parameter must be YYYYMMDD', { field: 'd' }));
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
    const matchResp = tswOk(await tswFetch(
      `/tournament/${tswId.toLowerCase()}/Matches/MatchesInDay?date=${encodeURIComponent(dateParam)}`,
    ), 'TSW matches AJAX');
    const matchHtml = await matchResp.text();
    const matches = parseTswMatches(matchHtml);
    setCache(cacheKey, matches);

    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify({ tswId, date: formatMatchDate(dateParam), matches }));
  } catch (err) {
    sendError(res, err, 'tournament-matches-day');
  }
}

// ── Placeholder actions for future TSW tournament endpoints ─────────────────

async function handlePlayers(tswId, _req, res) {
  try {
    const refresh = isRefreshRequest(_req);
    const cacheKey = `tournament-players:${tswId}`;
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
        res.end(JSON.stringify(cached));
        return;
      }
    }

    const playersUrl = `/tournament/${tswId.toLowerCase()}/Players/GetPlayersContent`;
    const resp = tswOk(await tswFetch(playersUrl, {
      method: 'POST',
      extraHeaders: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${TSW_BASE}/tournament/${tswId}/players`,
      },
      body: '',
    }), 'Players content');
    const html = await resp.text();
    const players = parseTswTournamentPlayersArray(html);
    const result = { tswId, playerCount: players.length, players };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-players');
  }
}

async function handleDraws(tswId, _req, res) {
  try {
    const refresh = isRefreshRequest(_req);
    const cacheKey = `tournament-draws:${tswId}`;
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
        res.end(JSON.stringify(cached));
        return;
      }
    }

    const drawsPath = `/sport/draws.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = tswOk(await tswFetch(drawsPath), 'TSW draws page');
    const html = await resp.text();
    const draws = parseTswDrawsList(html);
    const result = { tswId, drawCount: draws.length, draws };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-draws');
  }
}

async function handleEvents(tswId, _req, res) {
  try {
    const refresh = isRefreshRequest(_req);
    const cacheKey = `tournament-events:${tswId}`;
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
        res.end(JSON.stringify(cached));
        return;
      }
    }

    const eventsPath = `/sport/events.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = tswOk(await tswFetch(eventsPath), 'TSW events page');
    const html = await resp.text();
    const events = parseTswEvents(html);
    const result = { tswId, eventCount: events.length, events };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-events');
  }
}

async function handleSeeds(tswId, _req, res) {
  try {
    const refresh = isRefreshRequest(_req);
    const cacheKey = `tournament-seeds:${tswId}`;
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
        res.end(JSON.stringify(cached));
        return;
      }
    }

    const seedsPath = `/sport/seeds.aspx?id=${encodeURIComponent(tswId)}`;
    const resp = tswOk(await tswFetch(seedsPath), 'TSW seeds page');
    const html = await resp.text();
    const events = parseTswSeeding(html);
    const result = { tswId, eventCount: events.length, events };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-seeds');
  }
}

async function handleEventDetail(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const eventId = req.query?.eventId || urlObj.searchParams.get('eventId');
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';
  if (!eventId || !/^\d+$/.test(eventId)) {
    return sendApiError(res, new ValidationError('eventId query parameter required (numeric)', { field: 'eventId' }));
  }

  const cacheKey = `tournament-event-detail:${tswId}:${eventId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }
  }

  try {
    const eventPath = `/sport/event.aspx?id=${encodeURIComponent(tswId)}&event=${encodeURIComponent(eventId)}`;
    const resp = tswOk(await tswFetch(eventPath), 'TSW event page');
    const html = await resp.text();

    const parsed = parseTswEventDetail(html);

    const result = {
      tswId,
      eventId: parseInt(eventId, 10),
      eventName: parsed.eventName,
      entriesCount: parsed.entriesCount,
      draws: parsed.draws,
      entries: parsed.entries,
    };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-event-detail');
  }
}

async function handlePlayerDetail(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const playerId = req.query?.playerId || urlObj.searchParams.get('playerId');
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';
  if (!playerId || !/^\d+$/.test(playerId)) {
    return sendApiError(res, new ValidationError('playerId query parameter required (numeric)', { field: 'playerId' }));
  }

  try {
    const result = await fetchPlayerDetailInternal(tswId, parseInt(playerId, 10), refresh);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-player-detail');
  }
}

async function handleDrawBracket(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const drawId = req.query?.drawId || urlObj.searchParams.get('drawId');
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';
  if (!drawId || !/^\d+$/.test(drawId)) {
    return sendApiError(res, new ValidationError('drawId query parameter required (numeric)', { field: 'drawId' }));
  }

  const cacheKey = `tournament-draw-bracket:v7:${tswId}:${drawId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }
  }

  try {
    const tswIdLower = tswId.toLowerCase();
    const drawPath = `/tournament/${tswIdLower}/draw/${drawId}`;
    const resp = tswOk(await tswFetch(drawPath), 'TSW draw page');
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

      tswOk(standingsResp, 'Round robin standings');
      tswOk(matchesResp, 'Round robin matches');
      const standingsHtml = await standingsResp.text();
      const matchesHtml = await matchesResp.text();

      const standings = parseTswRoundRobinStandings(standingsHtml);
      const matches = parseTswRoundRobinMatches(matchesHtml);

      result = {
        tswId, drawId: parseInt(drawId, 10), drawType,
        groupName, groups, standings, matches,
      };
    } else {
      const sections = parseTswEliminationDraw(html);
      result = { tswId, drawId: parseInt(drawId, 10), drawType, sections };
    }

    if (result.drawType !== 'unknown') setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-draw-bracket');
  }
}

// ── Player schedule ─────────────────────────────────────────────────────────

async function fetchPlayerDetailInternal(tswId, playerId, refresh) {
  const cacheKey = `tournament-player-detail:${tswId}:${playerId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }
  const resp = tswOk(await tswFetch(`/tournament/${tswId.toLowerCase()}/player/${playerId}`), 'TSW player page');
  const html = await resp.text();
  const { playerName, memberId } = parseTswPlayerInfo(html);
  const events = parseTswPlayerEvents(html);
  const winLoss = parseTswPlayerWinLoss(html);
  const matches = parseTswPlayerMatches(html);
  const hasUpcomingMatches = matches.some(m => !m.team1Won && !m.team2Won && !m.bye && !m.walkover && m.time);
  const result = { tswId, playerId, playerName, memberId: memberId || undefined, club: '', events, winLoss, matches, hasUpcomingMatches };
  setCache(cacheKey, result);
  return result;
}

async function fetchTournamentDetailInternal(tswId, refresh) {
  const cacheKey = `tournament-detail:${tswId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }
  const resp = tswOk(await tswFetch(`/sport/draws.aspx?id=${encodeURIComponent(tswId)}`), 'TSW draws page');
  const html = await resp.text();
  const info = parseTswTournamentInfo(html);
  const draws = parseTswDrawsList(html);
  const result = { tswId, name: info.name, dates: info.dates, location: info.location, draws, tswUrl: `https://www.tournamentsoftware.com/tournament/${tswId}` };
  setCache(cacheKey, result);
  return result;
}

async function fetchDrawBracketInternal(tswId, drawId, refresh) {
  const cacheKey = `tournament-draw-bracket:v7:${tswId}:${drawId}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }
  const tswIdLower = tswId.toLowerCase();
  const resp = tswOk(await tswFetch(`/tournament/${tswIdLower}/draw/${drawId}`), 'TSW draw page');
  const html = await resp.text();
  const drawType = parseTswDrawType(html);
  let result;
  if (drawType === 'round-robin') {
    const groups = parseTswRoundRobinGroups(html);
    for (const g of groups) { if (g.active && !g.drawId) g.drawId = drawId; }
    const groupName = parseTswRoundRobinGroupName(html);
    const [sResp, mResp] = await Promise.all([
      tswFetch(`/tournament/${tswIdLower}/Draw/${drawId}/GetStandings`),
      tswFetch(`/tournament/${tswIdLower}/Draw/${drawId}/GetMatchesContent?tabindex=1`),
    ]);
    tswOk(sResp, 'RR standings'); tswOk(mResp, 'RR matches');
    result = { tswId, drawId, drawType, groupName, groups, standings: parseTswRoundRobinStandings(await sResp.text()), matches: parseTswRoundRobinMatches(await mResp.text()) };
  } else {
    result = { tswId, drawId, drawType, sections: parseTswEliminationDraw(html) };
  }
  setCache(cacheKey, result);
  return result;
}

// Map roundLevel → round name. The rounds array is in column order (left-to-right)
// with non-match columns at the start and possibly "Winner" at the end.
// RoundLevel 1 = final (rightmost match column), higher = earlier rounds.
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
    let deepestWinLevel = Infinity;
    let deepestWinNum = 0;
    for (const bm of section.matches || []) {
      if (!bm.winner) continue;
      if (bm.winner.playerId !== playerId && bm.winner.partnerPlayerId !== playerId) continue;
      if (bm.roundLevel < deepestWinLevel) {
        deepestWinLevel = bm.roundLevel;
        deepestWinNum = bm.matchNum;
      }
    }
    if (deepestWinLevel === Infinity) {
      const entry = (section.entries || []).find(
        e => e.playerId === playerId || e.partnerPlayerId === playerId,
      );
      if (!entry) continue;
      const maxRL = Math.max(...(section.matches || []).map(m => m.roundLevel), 0);
      if (maxRL === 0) continue;
      deepestWinLevel = maxRL + 1;
      deepestWinNum = Math.ceil(entry.position / 2);
    }
    const currentLevel = deepestWinLevel - 1;
    if (currentLevel < 1) continue;
    const currentNum = Math.ceil(deepestWinNum / 2);

    // Check if player was eliminated from this section
    const currentMatchId = `${currentLevel}${String(currentNum).padStart(3, '0')}`;
    const currentMatch = (section.matches || []).find(m => m.matchId === currentMatchId);
    if (currentMatch?.winner) {
      const isPlayer = currentMatch.winner.playerId === playerId
        || currentMatch.winner.partnerPlayerId === playerId;
      if (!isPlayer) continue; // eliminated, try next section (consolation)
    }

    // Walk from currentLevel-1 toward the final, collecting scheduled matches
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
      const otherFeedLevel = level + 1;
      const otherId = `${otherFeedLevel}${String(otherNum).padStart(3, '0')}`;
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

function findConsolationPath(bracket, playerId, mainCurrentLevel, mainCurrentNum) {
  if (!bracket || bracket.drawType !== 'elimination') return null;
  const mainSection = (bracket.sections || [])[0];
  if (!mainSection) return null;
  const consSection = (bracket.sections || []).find(s => s.name && s.name.toLowerCase().includes('consolation'));
  if (!consSection || !(consSection.matches || []).length) return null;
  const mainMaxRL = Math.max(...mainSection.matches.map(m => m.roundLevel));
  const consMaxRL = Math.max(...consSection.matches.map(m => m.roundLevel));
  const consEntryRL = consMaxRL - (mainMaxRL - mainCurrentLevel);
  if (consEntryRL < 1 || consEntryRL > consMaxRL) return null;
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

// Consolation semi-final losers: look for a consolation-specific 3/4 play-off section.
// If no such section exists, the player is simply eliminated (return null).
function findConsolationPlayoffPath(bracket, playerId) {
  if (!bracket || bracket.drawType !== 'elimination') return null;

  const consSection = (bracket.sections || []).find(s => s.name && /consolation/i.test(s.name) && !/play-?off/i.test(s.name));
  if (!consSection) return null;

  // Determine the player's current position within the consolation bracket
  let deepestWinLevel = Infinity, deepestWinNum = 0;
  for (const bm of consSection.matches || []) {
    if (!bm.winner) continue;
    if (bm.winner.playerId !== playerId && bm.winner.partnerPlayerId !== playerId) continue;
    if (bm.roundLevel < deepestWinLevel) { deepestWinLevel = bm.roundLevel; deepestWinNum = bm.matchNum; }
  }
  if (deepestWinLevel === Infinity) return null;
  const currentLevel = deepestWinLevel - 1;
  if (currentLevel !== 2) return null; // Only applies to consolation semi-final

  const currentNum = Math.ceil(deepestWinNum / 2);
  const consName = consSection.name || '';

  // Look for a consolation play-off section (e.g. "BS U13 - Consolation - Play-off 3/4")
  const consPlayoffSection = (bracket.sections || []).find(
    s => s.name && /consolation/i.test(s.name) && /play-?off\s*3\/?4/i.test(s.name),
  );

  if (!consPlayoffSection || !(consPlayoffSection.matches || []).length) return null;

  const sectionLabel = consPlayoffSection.name.replace(/^[^-]*-\s*/, '') || 'Consolation Play-off 3/4';
  const finalMatch = (consPlayoffSection.matches || []).find(m => m.matchId === '1001');
  const roundName = getRoundName(consPlayoffSection, 1);

  let opponent = null;
  const otherSlotNum = currentNum === 1 ? 2 : 1;
  const otherSlotId = `2${String(otherSlotNum).padStart(3, '0')}`;
  const otherSlot = (consPlayoffSection.matches || []).find(m => m.matchId === otherSlotId);
  if (otherSlot?.winner) {
    const w = otherSlot.winner;
    const names = [w.name]; const ids = [w.playerId];
    if (w.partner) { names.push(w.partner); ids.push(w.partnerPlayerId ?? null); }
    opponent = { names, playerIds: ids };
  }

  const matches = [];
  if (finalMatch) {
    matches.push({
      round: roundName,
      time: finalMatch.scheduledTime || '',
      court: '',
      date: '',
      dateLabel: '',
      opponent,
    });
  }

  return { section: sectionLabel, matches };
}

// Semi-final losers go to the 3/4 play-off bracket instead of consolation.
function findPlayoffPath(bracket, playerId, mainCurrentLevel, mainCurrentNum) {
  if (!bracket || bracket.drawType !== 'elimination') return null;
  if (mainCurrentLevel !== 2) return null;

  const playoffSection = (bracket.sections || []).find(
    s => s.name && /play-?off\s*3\/?4/i.test(s.name),
  );
  if (!playoffSection || !(playoffSection.matches || []).length) return null;

  const sectionLabel = playoffSection.name.replace(/^[^-]*-\s*/, '') || 'Play-off 3/4';
  const finalMatch = (playoffSection.matches || []).find(m => m.matchId === '1001');
  const roundName = getRoundName(playoffSection, 1);

  let opponent = null;
  const otherSlotNum = mainCurrentNum === 1 ? 2 : 1;
  const otherSlotId = `2${String(otherSlotNum).padStart(3, '0')}`;
  const otherSlot = (playoffSection.matches || []).find(m => m.matchId === otherSlotId);
  if (otherSlot?.winner) {
    const w = otherSlot.winner;
    const names = [w.name]; const ids = [w.playerId];
    if (w.partner) { names.push(w.partner); ids.push(w.partnerPlayerId ?? null); }
    opponent = { names, playerIds: ids };
  }

  const matches = [];
  if (finalMatch) {
    matches.push({
      round: roundName,
      time: finalMatch.scheduledTime || '',
      court: '',
      date: '',
      dateLabel: '',
      opponent,
    });
  }

  return { section: sectionLabel, matches };
}

function parseScheduledTime(timeStr) {
  if (!timeStr) return { date: '', time: '', dateLabel: '' };
  const m = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day = m[2].padStart(2, '0');
    const year = m[3];
    const date = `${year}-${month}-${day}`;
    const time = m[4].trim();
    const d = new Date(`${date}T00:00:00`);
    const dateLabel = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { date, time, dateLabel };
  }
  return { date: '', time: timeStr, dateLabel: '' };
}

function matchEventToDraws(eventNames, drawsList) {
  const result = new Map();
  for (const eventName of eventNames) {
    const exact = drawsList.find(d => d.name === eventName);
    if (exact) { result.set(eventName, exact); continue; }
    const prefixed = drawsList.find(d =>
      d.name.startsWith(eventName) && !/consolation/i.test(d.name) && !/play-?off/i.test(d.name),
    );
    if (prefixed) result.set(eventName, prefixed);
  }
  return result;
}

function computeConsolationInfo(bracket, playerId, roundName) {
  let consolation = null;
  let consolationMatches = [];

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
        if (entry) {
          const maxRL = Math.max(...mainSection.matches.map(mm => mm.roundLevel), 0);
          deepestWinLevel = maxRL + 1;
          deepestWinNum = Math.ceil(entry.position / 2);
        }
      }
      if (deepestWinLevel !== Infinity) {
        const currentLevel = deepestWinLevel - 1;
        const currentNum = Math.ceil(deepestWinNum / 2);
        if (currentLevel >= 1) {
          let consPath = findConsolationPath(bracket, playerId, currentLevel, currentNum)
            || findPlayoffPath(bracket, playerId, currentLevel, currentNum);
          if (!consPath && /semi/i.test(roundName || '')) {
            consPath = findPlayoffPath(bracket, playerId, 2, currentNum);
          }
          if (consPath) { consolation = consPath.section; consolationMatches = consPath.matches; }
        }
      }
    }
  }

  return { consolation, consolationMatches };
}

async function handlePlayerSchedule(tswId, req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const rawIds = req.query?.playerIds || urlObj.searchParams.get('playerIds') || '';
  const playerIds = rawIds.split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
  const refresh = req.query?.refresh === '1' || urlObj.searchParams.get('refresh') === '1';

  if (playerIds.length === 0) {
    return sendApiError(res, new ValidationError('playerIds query parameter required (comma-separated numeric)', { field: 'playerIds' }));
  }

  const cacheKey = `tournament-player-schedule:v2:${tswId}:${playerIds.sort().join(',')}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }
  }

  try {
    // Phase 1: Parallel fetch player detail(s) + tournament detail
    const [playerDetails, detail] = await Promise.all([
      Promise.all(playerIds.map(pid => fetchPlayerDetailInternal(tswId, pid, refresh).catch(() => null))),
      fetchTournamentDetailInternal(tswId, refresh),
    ]);

    const validDetails = playerDetails.filter(Boolean);
    const players = validDetails.map(pd => ({ playerId: pd.playerId, playerName: pd.playerName }));

    // Phase 2: Filter upcoming matches from player match cards
    const allUpcoming = [];
    for (const pd of validDetails) {
      for (const m of pd.matches || []) {
        if (m.team1Won || m.team2Won || m.bye || m.walkover) continue;
        if (!m.time) continue;
        allUpcoming.push({ ...m, _playerId: pd.playerId });
      }
    }

    const upcomingEventNames = new Set(allUpcoming.map(m => m.event).filter(Boolean));
    const eventToDrawObj = matchEventToDraws(upcomingEventNames, detail.draws || []);

    // Phase 3: Fetch brackets only for elimination draws with upcoming matches
    const bracketCache = new Map();
    const drawIdsToFetch = new Set();
    for (const [, drawObj] of eventToDrawObj) {
      const t = (drawObj.type || '').toLowerCase();
      if (t.includes('elimination')) drawIdsToFetch.add(drawObj.drawId);
    }

    await Promise.all([...drawIdsToFetch].map(async (drawId) => {
      try {
        bracketCache.set(drawId, await fetchDrawBracketInternal(tswId, drawId, refresh));
      } catch { bracketCache.set(drawId, null); }
    }));

    // Phase 4: Build schedule from match cards + bracket chain data
    const matchesByDate = new Map();

    for (const m of allUpcoming) {
      const pid = m._playerId;
      const parsed = parseScheduledTime(m.time);
      const dateKey = parsed.date || 'unknown';

      const inTeam1 = (m.team1Ids || []).includes(pid);
      const inTeam2 = (m.team2Ids || []).includes(pid);
      if (!inTeam1 && !inTeam2) continue;

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
          const consInfo = computeConsolationInfo(bracket, pid, m.round);
          consolation = consInfo.consolation;
          consolationMatches = consInfo.consolationMatches;
        }
      }

      if (!matchesByDate.has(dateKey)) {
        matchesByDate.set(dateKey, { dateLabel: parsed.dateLabel || '', matches: [] });
      }
      matchesByDate.get(dateKey).matches.push({
        playerId: pid,
        event: m.event || '',
        round: m.round || '',
        time: parsed.time || m.time || '',
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

    const dateRangeMatch = (detail.dates || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    let startDate = '', endDate = '';
    if (dateRangeMatch) {
      const [, sM, sD, sY, eM, eD, eY] = dateRangeMatch;
      startDate = `${sY}-${sM.padStart(2, '0')}-${sD.padStart(2, '0')}`;
      endDate = `${eY}-${eM.padStart(2, '0')}-${eD.padStart(2, '0')}`;
    }

    const days = [...matchesByDate.entries()]
      .filter(([date]) => date !== 'unknown')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, dateLabel: data.dateLabel, matches: data.matches }));
    const unknownDay = matchesByDate.get('unknown');
    if (unknownDay?.matches.length) {
      days.push({ date: '', dateLabel: '', matches: unknownDay.matches });
    }

    const tournamentName = (detail.name || '').replace(/^Tournamentsoftware\.com\s*-\s*/i, '');
    const result = { tswId, tournamentName, startDate, endDate, players, days };

    setCache(cacheKey, result);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(result));
  } catch (err) {
    sendError(res, err, 'tournament-player-schedule');
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
  seeds: handleSeeds,
  'event-detail': handleEventDetail,
  'player-detail': handlePlayerDetail,
  'player-schedule': handlePlayerSchedule,
  'draw-bracket': handleDrawBracket,
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const tswId = req.query?.tswId || req.url?.match(/\/tournaments\/([^/?]+)/)?.[1];
  if (!tswId || !isValidTswId(tswId)) {
    return sendApiError(res, new ValidationError('tswId parameter required', { field: 'tswId' }));
  }

  const action = req.query?.action || req.url?.match(/\/tournaments\/[^/?]+\/([^/?]+)/)?.[1] || 'detail';
  const actionHandler = ACTIONS[action];
  if (!actionHandler) {
    return sendApiError(
      res,
      new ValidationError(`Unknown action: ${action}`, { validActions: Object.keys(ACTIONS) }),
    );
  }

  await actionHandler(tswId, req, res);
}
