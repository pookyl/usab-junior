import type {
  JuniorPlayerDetail,
  TournamentEntry,
  AgeGroup,
  EventType,
  H2HResult,
  UniquePlayer,
  TswPlayerStats,
  PlayerRankingTrend,
} from '../types/junior';
import { RANKINGS_DATE } from '../data/usaJuniorData';

// ── Cached dates (only dates with files on disk) ────────────────────────────
let cachedDatesCache: string[] | null = null;

export async function fetchCachedDates(): Promise<string[]> {
  if (cachedDatesCache) return cachedDatesCache;

  try {
    const res = await fetch('/api/cached-dates', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.dates) && data.dates.length > 0) {
      cachedDatesCache = data.dates;
      return data.dates;
    }
  } catch {
    // Fall back to current date only
  }
  return [RANKINGS_DATE];
}

export function invalidateRankingsCache() {
  allPlayersCache = null;
  allPlayersCacheDate = '';
}

export async function fetchPlayerDetail(
  usabId: string,
  ageGroup: AgeGroup,
  eventType: EventType,
  date: string = RANKINGS_DATE,
): Promise<JuniorPlayerDetail | null> {
  const url = `/api/player/${usabId}?age_group=${ageGroup}&category=${eventType}&date=${date}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;

    const data = await res.json();
    const entries: TournamentEntry[] = Array.isArray(data) ? data : data.entries ?? [];
    const gender: string | null = Array.isArray(data) ? null : data.gender ?? null;
    return {
      usabId,
      name: '',
      rank: 0,
      rankingPoints: 0,
      ageGroup,
      eventType,
      gender,
      tournamentHistory: entries,
    };
  } catch {
    return null;
  }
}

export function usabPlayerUrl(
  usabId: string,
  ageGroup: AgeGroup,
  eventType: EventType,
  date = RANKINGS_DATE,
) {
  return `https://usabjrrankings.org/${usabId}/details?age_group=${ageGroup}&category=${eventType}&date=${date}`;
}

export async function fetchH2H(
  usabId1: string,
  usabId2: string,
): Promise<H2HResult> {
  const url = `/api/h2h?player1=${usabId1}&player2=${usabId2}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`H2H API ${res.status}: ${await res.text()}`);
  return res.json();
}

export function tswH2HUrl(usabId1: string, usabId2: string) {
  return `https://www.tournamentsoftware.com/head-2-head?OrganizationCode=C36A90FE-DFA8-414B-A8B6-F2BCF6B9B8BD&T1P1MemberID=${usabId1}&T2P1MemberID=${usabId2}`;
}

let allPlayersCache: UniquePlayer[] | null = null;
let allPlayersCacheDate = '';

export async function fetchAllPlayers(
  date: string = RANKINGS_DATE,
): Promise<UniquePlayer[]> {
  if (allPlayersCache && allPlayersCacheDate === date) return allPlayersCache;

  const url = `/api/all-players?date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const players: UniquePlayer[] = await res.json();
  if (!Array.isArray(players)) throw new Error('Invalid response');

  allPlayersCache = players;
  allPlayersCacheDate = date;
  return players;
}

let tswStatsCache = new Map<string, TswPlayerStats>();

export async function fetchPlayerTswStats(
  usabId: string,
  playerName: string,
): Promise<TswPlayerStats> {
  if (tswStatsCache.has(usabId)) return tswStatsCache.get(usabId)!;

  const url = `/api/player/${usabId}/tsw-stats?name=${encodeURIComponent(playerName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`TSW stats API ${res.status}`);

  const stats: TswPlayerStats = await res.json();
  tswStatsCache.set(usabId, stats);
  return stats;
}

export function tswSearchUrl(playerName: string) {
  return `https://www.tournamentsoftware.com/find/player?q=${encodeURIComponent(playerName)}`;
}

export function tswTournamentUrl(tournamentId: string) {
  return `https://www.tournamentsoftware.com/sport/tournament.aspx?id=${tournamentId}`;
}

const trendCache = new Map<string, PlayerRankingTrend>();

export async function fetchPlayerRankingTrend(
  usabId: string,
): Promise<PlayerRankingTrend> {
  if (trendCache.has(usabId)) return trendCache.get(usabId)!;

  const url = `/api/player/${usabId}/ranking-trend`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Trend API ${res.status}`);

  const data: PlayerRankingTrend = await res.json();
  trendCache.set(usabId, data);
  return data;
}
