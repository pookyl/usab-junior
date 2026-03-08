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

      const olderYears = years.slice(1, 4);
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
          if (r.status === 'fulfilled' && r.value.tournaments.length > 0) {
            tournamentsByYear[r.value.year] = r.value.tournaments;
          }
        }
      }
    }

    const stats = {
      tswProfileUrl, tswSearchUrl: tswSearchLink,
      ...overviewStats, recentResults, tournamentsByYear,
    };

    setCache(cacheKey, stats);
    return res.setHeader('X-Cache', 'MISS').status(200).json(stats);
  } catch (err) {
    setCache(cacheKey, fallback);
    return res.status(200).json(fallback);
  }
}
