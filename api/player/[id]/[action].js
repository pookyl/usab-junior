import {
  TSW_BASE, TSW_ORG_CODE,
  getCached, setCache, listCachedDates, loadDiskCacheForDate,
  tswFetch, tswUsabProfilePath, tswUsabTournamentsPath, tswUsabOverviewPath,
  emptyCat, parseTswOverviewStats, parseTswTournaments,
  setCors, isValidUsabId,
} from '../../_lib/shared.js';

function sendJson(res, status, data, extraHeaders) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { id: usabId, action } = req.query;

  if (action === 'tsw-stats') return handleTswStats(req, res, usabId);
  if (action === 'ranking-trend') return handleRankingTrend(req, res, usabId);

  sendJson(res, 404, { error: `Unknown action: ${action}` });
}

async function handleTswStats(req, res, usabId) {
  const playerName = req.query.name ?? '';
  const cacheKey = `tsw-stats:${usabId}`;

  const cached = getCached(cacheKey);
  if (cached) { sendJson(res, 200, cached, { 'X-Cache': 'HIT' }); return; }

  const profilePath = tswUsabProfilePath(usabId);
  const tswProfileUrl = `${TSW_BASE}${profilePath}`;
  const tswSearchLink = `${TSW_BASE}/find/player?q=${encodeURIComponent(playerName)}`;
  const fallback = {
    tswProfileUrl, tswSearchUrl: tswSearchLink,
    total: emptyCat(), singles: emptyCat(),
    doubles: emptyCat(), mixed: emptyCat(),
    recentHistory: [], recentResults: [], tournamentsByYear: {},
  };

  try {
    const encoded = Buffer.from('base64:' + usabId).toString('base64');
    const encodedNoPad = encoded.replace(/=+$/, '');

    const [overviewResp, tournamentsResp] = await Promise.all([
      tswFetch(tswUsabOverviewPath(usabId)),
      tswFetch(tswUsabTournamentsPath(usabId)),
    ]);

    let overviewStats = {
      total: emptyCat(), singles: emptyCat(),
      doubles: emptyCat(), mixed: emptyCat(),
      recentHistory: [],
    };
    if (overviewResp.ok) {
      overviewStats = parseTswOverviewStats(await overviewResp.text());
    }

    const tournamentsByYear = {};
    let recentResults = [];

    if (tournamentsResp.ok) {
      const tournamentsHtml = await tournamentsResp.text();

      const yearRegex = /data-tabid="(\d{4})"/g;
      const years = [];
      let ym;
      while ((ym = yearRegex.exec(tournamentsHtml)) !== null) years.push(parseInt(ym[1]));

      const currentYearData = parseTswTournaments(tournamentsHtml, playerName);
      recentResults = currentYearData.recentResults;
      if (years[0] && currentYearData.tournaments.length > 0) {
        tournamentsByYear[years[0]] = currentYearData.tournaments;
      }

      const olderYears = years.slice(1);
      if (olderYears.length > 0) {
        const olderResults = await Promise.allSettled(
          olderYears.map(async (year) => {
            const path = `/player/${TSW_ORG_CODE}/${encodeURIComponent(encoded)}/tournaments/GetPlayerTournamentsByYear?AOrganizationCode=${TSW_ORG_CODE}&AMemberID=${encodedNoPad}&Year=${year}&IncludeOlderTournaments=False`;
            const resp = await tswFetch(path);
            if (!resp.ok) return { year, tournaments: [], results: [] };
            const html = await resp.text();
            const data = parseTswTournaments(html, playerName);
            return { year, tournaments: data.tournaments, results: data.recentResults };
          }),
        );

        for (const r of olderResults) {
          if (r.status === 'fulfilled') {
            if (r.value.tournaments.length > 0) {
              tournamentsByYear[r.value.year] = r.value.tournaments;
            }
            if (r.value.results.length > 0) {
              recentResults = recentResults.concat(r.value.results);
            }
          }
        }
      }

      const olderTabMatch = tournamentsHtml.match(/data-href="([^"]+)"[^>]*data-tabid="older"/);
      if (olderTabMatch) {
        try {
          const olderPath = olderTabMatch[1].replace(/&amp;/g, '&');
          const olderResp = await tswFetch(olderPath);
          if (olderResp.ok) {
            const olderHtml = await olderResp.text();
            const olderData = parseTswTournaments(olderHtml, playerName);
            for (const t of olderData.tournaments) {
              const ym = t.dates.match(/(\d{4})/);
              if (ym) {
                const y = parseInt(ym[1]);
                if (!tournamentsByYear[y]) tournamentsByYear[y] = [];
                tournamentsByYear[y].push(t);
              }
            }
            if (olderData.recentResults.length > 0) {
              recentResults = recentResults.concat(olderData.recentResults);
            }
          }
        } catch (_) { /* older tab fetch is best-effort */ }
      }
    }

    const stats = {
      tswProfileUrl, tswSearchUrl: tswSearchLink,
      ...overviewStats, recentResults, tournamentsByYear,
    };

    setCache(cacheKey, stats);
    sendJson(res, 200, stats, { 'X-Cache': 'MISS' });
  } catch (err) {
    console.error('[tsw-stats] error:', err.message);
    sendJson(res, 200, fallback);
  }
}

async function handleRankingTrend(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) { sendJson(res, 400, { error: 'Invalid player ID' }); return; }

  const cacheKey = `trend:${usabId}`;

  const cached = getCached(cacheKey);
  if (cached) { sendJson(res, 200, cached, { 'X-Cache': 'HIT' }); return; }

  try {
    const dates = (await listCachedDates()).sort();
    const trend = [];
    let playerName = '';

    for (const date of dates) {
      const disk = await loadDiskCacheForDate(date);
      if (!disk || !disk.allPlayers) continue;
      const player = disk.allPlayers.find((p) => p.usabId === usabId);
      if (!player) continue;
      if (!playerName && player.name) playerName = player.name;
      trend.push({ date, entries: player.entries });
    }

    const result = { usabId, name: playerName, trend };
    setCache(cacheKey, result);
    sendJson(res, 200, result, { 'X-Cache': 'MISS' });
  } catch (err) {
    console.error('[ranking-trend] error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
}
