import {
  USAB_BASE,
  BROWSER_HEADERS,
  TSW_BASE,
  TSW_ORG_CODE,
  fetchWithRetry,
  parsePlayerDetailGrouped,
  parsePlayerGender,
  tswFetch,
  tswUsabProfilePath,
  tswUsabTournamentsPath,
  tswUsabOverviewPath,
  emptyCat,
  parseTswOverviewStats,
  parseTswTournaments,
  getDiskCachedDate,
} from '../../_lib/shared.js';
import { getCached, setCache, setCors } from '../../_lib/runtime.js';
import { isValidUsabId } from '../../_lib/validation.js';
import { listCachedDates, loadDiskCacheForDate, loadPlayerTrendsIndex } from '../../_lib/rankingsDiskCache.js';
import {
  createRequestMetrics,
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
  if (action === 'ranking-detail') return handleRankingDetail(req, res, usabId);

  return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } });
}

async function handleTswStats(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) {
    return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  }

  const playerName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  const normalizedName = playerName.toLowerCase().replace(/\s+/g, ' ').trim();
  const cacheKey = `tsw-stats:v3:${usabId}:${normalizedName || '__unknown__'}`;

  const cached = getCached(cacheKey);
  if (cached) { sendJson(res, 200, cached, { 'X-Cache': 'HIT' }); return; }

  const profilePath = tswUsabProfilePath(usabId);
  const tswProfileUrl = `${TSW_BASE}${profilePath}`;
  const tswSearchLink = `${TSW_BASE}/find/player?q=${encodeURIComponent(playerName)}`;
  try {
    const metrics = createRequestMetrics('tsw-stats');
    const encoded = Buffer.from('base64:' + usabId).toString('base64');
    const encodedNoPad = encoded.replace(/=+$/, '');
    const warnings = [];

    const [overviewResp, tournamentsResp] = await metrics.time('initial_fetches', () => Promise.all([
      tswFetch(tswUsabOverviewPath(usabId)),
      tswFetch(tswUsabTournamentsPath(usabId)),
    ]));

    if (!overviewResp.ok && !tournamentsResp.ok) {
      throw new UpstreamError(`TSW profile unavailable (overview=${overviewResp.status}, tournaments=${tournamentsResp.status})`);
    }

    let overviewStats = {
      total: emptyCat(), singles: emptyCat(),
      doubles: emptyCat(), mixed: emptyCat(),
      recentHistory: [],
    };
    if (overviewResp.ok) {
      overviewStats = await metrics.time('parse_overview', async () => parseTswOverviewStats(await overviewResp.text()));
    } else {
      warnings.push(`overview:${overviewResp.status}`);
    }

    const tournamentsByYear = {};

    if (tournamentsResp.ok) {
      const tournamentsHtml = await metrics.time('read_tournaments_html', () => tournamentsResp.text());

      const yearRegex = /data-tabid="(\d{4})"/g;
      const years = [];
      let ym;
      while ((ym = yearRegex.exec(tournamentsHtml)) !== null) years.push(parseInt(ym[1]));

      const currentYearData = await metrics.time('parse_current_year', async () => parseTswTournaments(tournamentsHtml, playerName));
      if (years[0] && currentYearData.tournaments.length > 0) {
        tournamentsByYear[years[0]] = currentYearData.tournaments;
      }

      const olderYears = years.slice(1);
      if (olderYears.length > 0) {
        const olderResults = await metrics.time('fetch_older_years', () => Promise.allSettled(
          olderYears.map(async (year) => {
            const path = `/player/${TSW_ORG_CODE}/${encodeURIComponent(encoded)}/tournaments/GetPlayerTournamentsByYear?AOrganizationCode=${TSW_ORG_CODE}&AMemberID=${encodedNoPad}&Year=${year}&IncludeOlderTournaments=False`;
            const resp = await tswFetch(path);
            if (!resp.ok) return { year, tournaments: [] };
            const html = await resp.text();
            const data = parseTswTournaments(html, playerName);
            return { year, tournaments: data.tournaments };
          }),
        ));

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
          const olderResp = await metrics.time('fetch_older_tab', () => tswFetch(olderPath));
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
    metrics.log({ years: Object.keys(tournamentsByYear).length, degraded: warnings.length > 0 });
    sendJson(res, 200, stats, metrics.buildHeaders({ 'X-Cache': 'MISS' }));
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
    const metrics = createRequestMetrics('ranking-trend');
    const indexed = await metrics.time('load_index', () => loadPlayerTrendsIndex());
    let result = indexed?.players?.[usabId] ?? null;

    if (!result) {
      const dates = (await metrics.time('list_dates', () => listCachedDates())).sort();
      const trend = [];
      let playerName = '';

      for (const date of dates) {
        const disk = await metrics.time(`load_${date}`, () => loadDiskCacheForDate(date));
        if (!disk || !disk.allPlayers) continue;
        const player = disk.allPlayers.find((p) => p.usabId === usabId);
        if (!player) continue;
        if (!playerName && player.name) playerName = player.name;
        trend.push({ date, entries: player.entries });
      }

      result = { usabId, name: playerName, trend };
    }

    setCache(cacheKey, result);
    metrics.log({ points: result.trend.length, source: indexed?.players?.[usabId] ? 'index' : 'scan' });
    sendJson(res, 200, result, metrics.buildHeaders({ 'X-Cache': 'MISS' }));
  } catch (err) {
    sendApiError(res, err, { logLabel: 'ranking-trend' });
  }
}

async function handleRankingDetail(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) {
    return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  }

  const defaultDate = await getDiskCachedDate() || new Date().toISOString().slice(0, 10);
  const date = req.query.date || defaultDate;
  const cacheKey = `ranking-detail:${usabId}:${date}`;

  const cached = getCached(cacheKey);
  if (cached) { sendJson(res, 200, cached, { 'X-Cache': 'HIT' }); return; }

  try {
    const metrics = createRequestMetrics('ranking-detail');
    const url = `${USAB_BASE}/${encodeURIComponent(usabId)}/details?date=${encodeURIComponent(date)}`;
    const response = await metrics.time('fetch_detail', () => fetchWithRetry(url, { headers: BROWSER_HEADERS }, { timeoutMs: 30_000, retries: 1 }));
    if (!response.ok) throw new UpstreamError(`USAB ranking detail HTTP ${response.status}`);
    const html = await metrics.time('read_html', () => response.text());
    const gender = parsePlayerGender(html);
    const sections = parsePlayerDetailGrouped(html);
    const result = { usabId, gender, sections };
    setCache(cacheKey, result);
    metrics.log({ sections: sections.length });
    sendJson(res, 200, result, metrics.buildHeaders({ 'X-Cache': 'MISS' }));
  } catch (err) {
    sendApiError(res, err, { logLabel: 'ranking-detail' });
  }
}
