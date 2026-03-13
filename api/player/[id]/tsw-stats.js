import {
  TSW_BASE, TSW_ORG_CODE,
  getCached, setCache,
  tswFetch, tswUsabProfilePath, tswUsabTournamentsPath, tswUsabOverviewPath,
  emptyCat, parseTswOverviewStats, parseTswTournaments,
  setCors,
} from '../../_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { id: usabId, name: playerName = '' } = req.query;
  const cacheKey = `tsw-stats:${usabId}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

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
    return res.setHeader('X-Cache', 'MISS').status(200).json(stats);
  } catch (err) {
    console.error('[tsw-stats] error:', err.message);
    return res.status(200).json(fallback);
  }
}
