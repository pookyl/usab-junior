import {
  USAB_BASE, BROWSER_HEADERS,
  getCached, setCache, getDiskCachedAllPlayers,
  parseRankings, setCors,
} from './_lib/shared.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { date = '2026-03-01' } = req.query;
  const cacheKey = `all-players:${date}`;

  const cached = getCached(cacheKey);
  if (cached) return res.setHeader('X-Cache', 'HIT').status(200).json(cached);

  // Check per-date disk cache first (serves historical dates without scraping)
  const perDateDisk = getDiskCachedAllPlayers(date);
  if (perDateDisk) {
    setCache(cacheKey, perDateDisk.players);
    return res.setHeader('X-Cache', 'DISK').status(200).json(perDateDisk.players);
  }

  // No per-date cache — fetch live from USAB
  const ageGroups = ['U11', 'U13', 'U15', 'U17', 'U19'];
  const eventTypes = ['BS', 'GS', 'BD', 'GD', 'XD'];
  const allPlayers = new Map();

  const tasks = [];
  for (const ag of ageGroups) {
    for (const et of eventTypes) {
      tasks.push({ ag, et });
    }
  }

  try {
    for (let i = 0; i < tasks.length; i += 5) {
      const batch = tasks.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async ({ ag, et }) => {
          const rankCacheKey = `rankings:${ag}:${et}:${date}`;
          const rankCached = getCached(rankCacheKey);
          if (rankCached) return { players: rankCached, ag, et };

          const url = `${USAB_BASE}/?age_group=${ag}&category=${et}&date=${date}`;
          const response = await fetch(url, { headers: BROWSER_HEADERS });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          const players = parseRankings(html, ag, et);
          setCache(rankCacheKey, players);
          return { players, ag, et };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const { players } = result.value;
          for (const player of players) {
            if (!allPlayers.has(player.usabId)) {
              allPlayers.set(player.usabId, { usabId: player.usabId, name: player.name, entries: [] });
            }
            allPlayers.get(player.usabId).entries.push({
              ageGroup: player.ageGroup, eventType: player.eventType,
              rank: player.rank, rankingPoints: player.rankingPoints,
            });
          }
        }
      }
    }

    const uniquePlayers = [...allPlayers.values()].sort((a, b) => a.name.localeCompare(b.name));

    if (uniquePlayers.length > 0) {
      setCache(cacheKey, uniquePlayers);
      return res.setHeader('X-Cache', 'MISS').status(200).json(uniquePlayers);
    }
  } catch { /* fall through to disk cache */ }

  const diskData = getDiskCachedAllPlayers();
  if (diskData) {
    return res.setHeader('X-Cache', 'DISK').status(200).json(diskData.players);
  }
  return res.status(200).json([]);
}
