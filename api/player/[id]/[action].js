import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { USAB_BASE, BROWSER_HEADERS, TSW_BASE, TSW_ORG_CODE, fetchWithRetry } from '../../_lib/core.js';
import { parsePlayerDetailGrouped, parsePlayerGender } from '../../_lib/rankingsData.js';
import { tswFetch, tswUsabProfilePath, tswUsabTournamentsPath, tswUsabOverviewPath } from '../../_lib/tswClient.js';
import { parseTswPlayerMatches } from '../../_lib/shared.js';
import { emptyCat, parseTswOverviewStats, parseTswTournaments, deduceMedalsFromRounds } from '../../_lib/tswStats.js';
import { getCached, setCache, setCors } from '../../_lib/runtime.js';
import { isValidUsabId } from '../../_lib/validation.js';
import { getDiskCachedDate, loadPlayerTrendsIndex } from '../../_lib/rankingsDiskCache.js';
import {
  createRequestMetrics,
  sendApiError,
  sendJson,
  UnavailableError,
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
  if (action === 'medals') return handleMedals(req, res, usabId);

  return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } });
}

async function handleTswStats(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) {
    return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  }

  const playerName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  const includeTournaments = req.query.includeTournaments !== '0' && req.query.includeTournaments !== 'false';
  const normalizedName = playerName.toLowerCase().replace(/\s+/g, ' ').trim();
  const cacheKey = `tsw-stats:v4:${usabId}:${normalizedName || '__unknown__'}:${includeTournaments ? 'full' : 'overview'}`;

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

    let overviewResp;
    let tournamentsResp = null;
    if (includeTournaments) {
      [overviewResp, tournamentsResp] = await metrics.time('initial_fetches', () => Promise.all([
        tswFetch(tswUsabOverviewPath(usabId)),
        tswFetch(tswUsabTournamentsPath(usabId)),
      ]));
    } else {
      overviewResp = await metrics.time('fetch_overview', () => tswFetch(tswUsabOverviewPath(usabId)));
    }

    if (includeTournaments) {
      if (!overviewResp.ok && !tournamentsResp.ok) {
        throw new UpstreamError(`TSW profile unavailable (overview=${overviewResp.status}, tournaments=${tournamentsResp.status})`);
      }
    } else if (!overviewResp.ok) {
      throw new UpstreamError(`TSW overview unavailable (status=${overviewResp.status})`);
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

    if (includeTournaments && tournamentsResp?.ok) {
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
    } else if (includeTournaments && tournamentsResp) {
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
    metrics.log({ years: Object.keys(tournamentsByYear).length, degraded: warnings.length > 0, includeTournaments });
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
    const result = indexed?.players?.[usabId] ?? null;

    if (!result) {
      throw new UnavailableError('Player ranking trend index unavailable');
    }

    setCache(cacheKey, result);
    metrics.log({ points: result.trend.length, source: 'index' });
    sendJson(res, 200, result, metrics.buildHeaders({ 'X-Cache': 'DISK' }));
  } catch (err) {
    sendApiError(res, err, { logLabel: 'ranking-trend' });
  }
}

function deduceMedalsFromTswMatches(matches) {
  return deduceMedalsFromRounds(
    matches.filter((m) => m.round).map((m) => ({ event: m.event, round: m.round, won: m.won })),
  );
}

const DATA_DIR = join(process.cwd(), 'data');
let usabTournamentIndex = null;

async function loadUsabTournamentIndex() {
  if (usabTournamentIndex) return usabTournamentIndex;
  const map = new Map();
  try {
    const files = await readdir(DATA_DIR);
    for (const f of files) {
      if (!/^tournaments-\d{4}-\d{4}\.json$/.test(f)) continue;
      try {
        const raw = await readFile(join(DATA_DIR, f), 'utf-8');
        const data = JSON.parse(raw);
        for (const t of data.tournaments || []) {
          if (t.tswId) map.set(t.tswId.toUpperCase(), t);
        }
      } catch { /* skip malformed files */ }
    }
  } catch { /* data dir missing */ }
  usabTournamentIndex = map;
  return map;
}

async function handleMedals(req, res, usabId) {
  if (!usabId || !isValidUsabId(usabId)) {
    return sendApiError(res, new ValidationError('Invalid player ID', { field: 'id' }));
  }

  const playerName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  const normalizedName = playerName.toLowerCase().replace(/\s+/g, ' ').trim();
  const cacheKey = `player-medals:v1:${usabId}:${normalizedName || '__unknown__'}`;

  const cached = getCached(cacheKey);
  if (cached) { sendJson(res, 200, cached, { 'X-Cache': 'HIT' }); return; }

  try {
    const metrics = createRequestMetrics('player-medals');
    const encoded = Buffer.from('base64:' + usabId).toString('base64');
    const encodedNoPad = encoded.replace(/=+$/, '');

    const tournamentsResp = await metrics.time('fetch_tournaments', () =>
      tswFetch(tswUsabTournamentsPath(usabId)),
    );

    if (!tournamentsResp.ok) {
      throw new UpstreamError(`TSW tournaments unavailable (status=${tournamentsResp.status})`);
    }

    const tournamentsHtml = await metrics.time('read_html', () => tournamentsResp.text());

    const yearRegex = /data-tabid="(\d{4})"/g;
    const years = [];
    let ym;
    while ((ym = yearRegex.exec(tournamentsHtml)) !== null) years.push(parseInt(ym[1]));

    const allTournaments = [];
    const currentYearData = await metrics.time('parse_current', () => parseTswTournaments(tournamentsHtml, playerName));
    allTournaments.push(...currentYearData.tournaments);

    const olderYears = years.slice(1);
    if (olderYears.length > 0) {
      const olderResults = await metrics.time('fetch_older', () => Promise.allSettled(
        olderYears.map(async (year) => {
          const path = `/player/${TSW_ORG_CODE}/${encodeURIComponent(encoded)}/tournaments/GetPlayerTournamentsByYear?AOrganizationCode=${TSW_ORG_CODE}&AMemberID=${encodedNoPad}&Year=${year}&IncludeOlderTournaments=False`;
          const resp = await tswFetch(path);
          if (!resp.ok) return [];
          const html = await resp.text();
          return parseTswTournaments(html, playerName).tournaments;
        }),
      ));
      for (const r of olderResults) {
        if (r.status === 'fulfilled') allTournaments.push(...r.value);
      }
    }

    const olderTabMatch = tournamentsHtml.match(/data-href="([^"]+)"[^>]*data-tabid="older"/);
    if (olderTabMatch) {
      try {
        const olderPath = olderTabMatch[1].replace(/&amp;/g, '&');
        const olderResp = await metrics.time('fetch_older_tab', () => tswFetch(olderPath));
        if (olderResp.ok) {
          const olderHtml = await olderResp.text();
          allTournaments.push(...parseTswTournaments(olderHtml, playerName).tournaments);
        }
      } catch { /* ignore older tab errors */ }
    }

    const usabIndex = await metrics.time('load_usab_index', () => loadUsabTournamentIndex());

    const summary = { gold: 0, silver: 0, bronze: 0, fourth: 0 };
    const tournaments = [];

    const needsVerification = [];

    for (const t of allTournaments) {
      let medals = deduceMedalsFromTswMatches(t.matches || []);
      if (medals.length === 0) continue;

      const tswIdUpper = t.tswId ? t.tswId.toUpperCase() : '';
      const usabTournament = tswIdUpper ? usabIndex.get(tswIdUpper) : null;

      const tswPlayerId = t.selfPlayerId || undefined;

      let endDate = usabTournament?.endDate || null;
      if (!endDate && t.dates) {
        const parts = t.dates.split(/\s*-\s*/);
        if (parts.length === 2) {
          const endPart = parts[1].trim();
          const parsed = new Date(endPart);
          if (!isNaN(parsed.getTime())) endDate = parsed.toISOString().slice(0, 10);
        }
      }

      const hasSuspectedWalkover = medals.some(m => m.place === 'bronze') && (() => {
        const matchList = t.matches || [];
        const eventsWithThirdFourth = new Set(
          matchList.filter(m => /3rd.*4th/i.test(m.round)).map(m => m.event),
        );
        return matchList.some(m =>
          /semi/i.test(m.round) && !m.won && !eventsWithThirdFourth.has(m.event),
        );
      })();

      const entry = {
        tournamentName: t.name,
        startDate: t.startDate ? t.startDate.slice(0, 10) : null,
        endDate,
        tswId: t.tswId || undefined,
        tswPlayerId: tswPlayerId || undefined,
        medals,
        isUsab: !!usabTournament,
        region: usabTournament?.region || undefined,
        tournamentType: usabTournament?.type || undefined,
      };

      if (hasSuspectedWalkover && t.tswId && tswPlayerId) {
        needsVerification.push({ entry, tswId: t.tswId, playerId: tswPlayerId });
      }

      tournaments.push(entry);
    }

    if (needsVerification.length > 0) {
      const verifyResults = await metrics.time('verify_walkovers', () => Promise.allSettled(
        needsVerification.map(async ({ entry, tswId, playerId }) => {
          const resp = await tswFetch(`/tournament/${tswId.toLowerCase()}/player/${playerId}`);
          if (!resp.ok) return null;
          const html = await resp.text();
          const detailMatches = parseTswPlayerMatches(html);
          const pid = typeof playerId === 'string' ? parseInt(playerId, 10) : playerId;
          const normalized = detailMatches
            .filter(m => m.round && (m.team1Won || m.team2Won))
            .map(m => {
              const onTeam1 = m.team1Ids?.includes(pid) ?? false;
              const onTeam2 = m.team2Ids?.includes(pid) ?? false;
              const won = (onTeam1 && m.team1Won) || (onTeam2 && m.team2Won);
              return { event: m.event, round: m.round, won };
            });
          return { entry, medals: deduceMedalsFromRounds(normalized) };
        }),
      ));
      for (const r of verifyResults) {
        if (r.status === 'fulfilled' && r.value) {
          r.value.entry.medals = r.value.medals;
        }
      }
    }

    for (const t of tournaments) {
      for (const m of t.medals) summary[m.place]++;
    }

    tournaments.sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return b.startDate.localeCompare(a.startDate);
    });

    const result = { usabId, playerName, tournaments, summary };
    setCache(cacheKey, result);
    metrics.log({ tournaments: tournaments.length, total: summary.gold + summary.silver + summary.bronze + summary.fourth });
    sendJson(res, 200, result, metrics.buildHeaders({ 'X-Cache': 'MISS' }));
  } catch (err) {
    sendApiError(res, err, { logLabel: 'player-medals' });
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
