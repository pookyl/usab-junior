import {
  TSW_BASE, TSW_ORG_CODE,
  getCached, setCache, listCachedDates, loadDiskCacheForDate,
  tswFetch, tswUsabProfilePath, tswUsabTournamentsPath, tswUsabOverviewPath,
  emptyCat, parseTswOverviewStats, parseTswTournaments,
  setCors, isValidUsabId,
} from '../../_lib/shared.js';
import {
  sendApiError,
  sendJson,
  UpstreamError,
  ValidationError,
} from '../../_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { id: usabId, action } = req.query;

  if (action === 'tsw-stats') return handleTswStats(req, res, usabId);
  if (action === 'ranking-trend') return handleRankingTrend(req, res, usabId);

  return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } });
}

async function handleTswStats(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) {
    return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  }

  const playerName = req.query.name ?? '';
  const cacheKey = `tsw-stats:${usabId}`;

  const cached = getCached(cacheKey);
  if (cached) { sendJson(res, 200, cached, { 'X-Cache': 'HIT' }); return; }

  const profilePath = tswUsabProfilePath(usabId);
  const tswProfileUrl = `${TSW_BASE}${profilePath}`;
  const tswSearchLink = `${TSW_BASE}/find/player?q=${encodeURIComponent(playerName)}`;
  try {
    const encoded = Buffer.from('base64:' + usabId).toString('base64');
    const encodedNoPad = encoded.replace(/=+$/, '');
    const warnings = [];

    const [overviewResp, tournamentsResp] = await Promise.all([
      tswFetch(tswUsabOverviewPath(usabId)),
      tswFetch(tswUsabTournamentsPath(usabId)),
    ]);

    if (!overviewResp.ok && !tournamentsResp.ok) {
      throw new UpstreamError(`TSW profile unavailable (overview=${overviewResp.status}, tournaments=${tournamentsResp.status})`);
    }

    let overviewStats = {
      total: emptyCat(), singles: emptyCat(),
      doubles: emptyCat(), mixed: emptyCat(),
      recentHistory: [],
    };
    if (overviewResp.ok) {
      overviewStats = parseTswOverviewStats(await overviewResp.text());
    } else {
      warnings.push(`overview:${overviewResp.status}`);
    }

    const tournamentsByYear = {};

    if (tournamentsResp.ok) {
      const tournamentsHtml = await tournamentsResp.text();

      const yearRegex = /data-tabid="(\d{4})"/g;
      const years = [];
      let ym;
      while ((ym = yearRegex.exec(tournamentsHtml)) !== null) years.push(parseInt(ym[1]));

      const currentYearData = parseTswTournaments(tournamentsHtml, playerName);
      if (years[0] && currentYearData.tournaments.length > 0) {
        tournamentsByYear[years[0]] = currentYearData.tournaments;
      }

      const olderYears = years.slice(1);
      if (olderYears.length > 0) {
        const olderResults = await Promise.allSettled(
          olderYears.map(async (year) => {
            const path = `/player/${TSW_ORG_CODE}/${encodeURIComponent(encoded)}/tournaments/GetPlayerTournamentsByYear?AOrganizationCode=${TSW_ORG_CODE}&AMemberID=${encodedNoPad}&Year=${year}&IncludeOlderTournaments=False`;
            const resp = await tswFetch(path);
            if (!resp.ok) return { year, tournaments: [] };
            const html = await resp.text();
            const data = parseTswTournaments(html, playerName);
            return { year, tournaments: data.tournaments };
          }),
        );

        for (const r of olderResults) {
          if (r.status === 'fulfilled') {
            if (r.value.tournaments.length > 0) {
              tournamentsByYear[r.value.year] = r.value.tournaments;
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
          }
        } catch (err) {
          warnings.push(`older-tab:${err instanceof Error ? err.message : 'request-failed'}`);
        }
      }
    } else {
      warnings.push(`tournaments:${tournamentsResp.status}`);
    }

    const stats = {
      tswProfileUrl, tswSearchUrl: tswSearchLink,
      ...overviewStats, tournamentsByYear,
    };

    if (warnings.length > 0) {
      stats.degraded = true;
      stats.warnings = warnings;
    }
    setCache(cacheKey, stats);
    sendJson(res, 200, stats, { 'X-Cache': 'MISS' });
  } catch (err) {
    sendApiError(res, err, { logLabel: 'tsw-stats' });
  }
}

async function handleRankingTrend(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) {
    return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  }

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
    sendApiError(res, err, { logLabel: 'ranking-trend' });
  }
}
