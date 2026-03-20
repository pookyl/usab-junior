import type {
  JuniorPlayerDetail,
  TournamentEntry,
  AgeGroup,
  EventType,
  H2HResult,
  UniquePlayer,
  DirectoryPlayer,
  TswPlayerStats,
  PlayerRankingTrend,
  TournamentsResponse,
  TournamentDetail,
  TournamentMedals,
  TournamentMatchDatesResponse,
  TournamentMatchDayResponse,
  TournamentPlayersResponse,
  TournamentEventsResponse,
  TournamentSeedingResponse,
  TournamentEventDetailResponse,
  TournamentPlayerDetailResponse,
  TournamentWinnersResponse,
  EliminationDrawResponse,
  RoundRobinDrawResponse,
} from '../types/junior';
import { RANKINGS_DATE } from '../data/usaJuniorData';

// ── Fetch with retry ────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, timeoutMs: number, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || attempt >= retries) return res;
    } catch (err) {
      if (attempt >= retries) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error((body as Record<string, string>).error || `${fallback} ${res.status}`);
}

// ── Cache helpers ────────────────────────────────────────────────────────────
const MAX_CACHE_SIZE = 200;

function cappedSet<K, V>(map: Map<K, V>, key: K, value: V) {
  if (map.size >= MAX_CACHE_SIZE) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

// ── Module-level caches ─────────────────────────────────────────────────────
let cachedDatesCache: string[] | null = null;
let allPlayersCache: UniquePlayer[] | null = null;
let allPlayersCacheDate = '';
const tswStatsCache = new Map<string, TswPlayerStats>();
const trendCache = new Map<string, PlayerRankingTrend>();

export interface FetchAllPlayersResult {
  players: UniquePlayer[];
  partial: boolean;
  failedCategories: string[];
}
let allPlayersCacheResult: FetchAllPlayersResult | null = null;

export function invalidateRankingsCache() {
  allPlayersCache = null;
  allPlayersCacheDate = '';
  allPlayersCacheResult = null;
  cachedDatesCache = null;
  tswStatsCache.clear();
  trendCache.clear();
  directoryCache = null;
  tournamentsCache = null;
  tournamentsCacheSeason = '';
  tournamentDetailCache.clear();
  tournamentMedalsCache.clear();
  tournamentEventsCache.clear();
  tournamentEventDetailCache.clear();
  tournamentSeedingCache.clear();
  tournamentWinnersCache.clear();
  tournamentPlayersCache.clear();
  tournamentPlayerDetailCache.clear();
  tournamentMatchDatesCache.clear();
  tournamentMatchDayCache.clear();
  drawBracketCache.clear();
}

// ── Player directory (cumulative across all dates, NOT invalidated on date change)

let directoryCache: DirectoryPlayer[] | null = null;

export async function fetchPlayerDirectory(): Promise<DirectoryPlayer[]> {
  if (directoryCache) return directoryCache;

  try {
    const res = await fetchWithRetry('/api/player-directory', 30_000);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data: DirectoryPlayer[] = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      directoryCache = data;
      return data;
    }
  } catch {
    // fall through
  }
  return [];
}

// ── Cached dates (only dates with files on disk) ────────────────────────────

export async function fetchCachedDates(): Promise<string[]> {
  if (cachedDatesCache) return cachedDatesCache;

  try {
    const res = await fetchWithRetry('/api/cached-dates', 10_000);
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
  return await res.json();
}

export function tswH2HUrl(usabId1: string, usabId2: string) {
  return `https://www.tournamentsoftware.com/head-2-head?OrganizationCode=C36A90FE-DFA8-414B-A8B6-F2BCF6B9B8BD&T1P1MemberID=${usabId1}&T2P1MemberID=${usabId2}`;
}

export async function fetchAllPlayers(
  date: string = RANKINGS_DATE,
): Promise<FetchAllPlayersResult> {
  if (allPlayersCache && allPlayersCacheDate === date && allPlayersCacheResult) {
    return allPlayersCacheResult;
  }

  const url = `/api/all-players?date=${date}`;
  const res = await fetchWithRetry(url, 120_000);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const players: UniquePlayer[] = await res.json();
  if (!Array.isArray(players)) throw new Error('Invalid response');

  const partial = res.headers.get('X-Partial') === 'true';
  const failedRaw = res.headers.get('X-Failed-Categories') ?? '';
  const failedCategories = failedRaw ? failedRaw.split(',').map((s) => s.trim()) : [];

  allPlayersCache = players;
  allPlayersCacheDate = date;
  const result: FetchAllPlayersResult = { players, partial, failedCategories };
  allPlayersCacheResult = result;
  return result;
}

export async function fetchPlayerTswStats(
  usabId: string,
  playerName: string,
): Promise<TswPlayerStats> {
  if (tswStatsCache.has(usabId)) return tswStatsCache.get(usabId)!;

  const url = `/api/player/${usabId}/tsw-stats?name=${encodeURIComponent(playerName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`TSW stats API ${res.status}`);

  const stats: TswPlayerStats = await res.json();
  cappedSet(tswStatsCache, usabId, stats);
  return stats;
}

export function tswSearchUrl(playerName: string) {
  return `https://www.tournamentsoftware.com/find/player?q=${encodeURIComponent(playerName)}`;
}

export function tswTournamentUrl(tournamentId: string) {
  return `https://www.tournamentsoftware.com/sport/tournament.aspx?id=${tournamentId}`;
}

export async function fetchPlayerRankingTrend(
  usabId: string,
): Promise<PlayerRankingTrend> {
  if (trendCache.has(usabId)) return trendCache.get(usabId)!;

  const url = `/api/player/${usabId}/ranking-trend`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Trend API ${res.status}`);

  const data: PlayerRankingTrend = await res.json();
  cappedSet(trendCache, usabId, data);
  return data;
}

// ── Tournaments ──────────────────────────────────────────────────────────────

let tournamentsCache: TournamentsResponse | null = null;
let tournamentsCacheSeason = '';

export async function fetchTournaments(
  season?: string,
): Promise<TournamentsResponse> {
  const cacheKey = season || '__all__';
  if (tournamentsCache && tournamentsCacheSeason === cacheKey) return tournamentsCache;

  const url = season ? `/api/tournaments?season=${encodeURIComponent(season)}` : '/api/tournaments';
  const res = await fetchWithRetry(url, 15_000);
  if (!res.ok) await throwApiError(res, 'Tournaments API');

  const data: TournamentsResponse = await res.json();
  tournamentsCache = data;
  tournamentsCacheSeason = cacheKey;
  return data;
}

const tournamentDetailCache = new Map<string, TournamentDetail>();

export async function fetchTournamentDetail(
  tswId: string,
  refresh = false,
): Promise<TournamentDetail> {
  if (!refresh && tournamentDetailCache.has(tswId)) return tournamentDetailCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/detail`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament detail API');

  const data: TournamentDetail = await res.json();
  cappedSet(tournamentDetailCache, tswId, data);
  return data;
}

// ── Tournament Events ────────────────────────────────────────────────────────

const tournamentEventsCache = new Map<string, TournamentEventsResponse>();
const tournamentEventDetailCache = new Map<string, TournamentEventDetailResponse>();
const tournamentSeedingCache = new Map<string, TournamentSeedingResponse>();

export async function fetchTournamentEvents(
  tswId: string,
  refresh = false,
): Promise<TournamentEventsResponse> {
  if (!refresh && tournamentEventsCache.has(tswId)) return tournamentEventsCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/events`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament events API');

  const data: TournamentEventsResponse = await res.json();
  cappedSet(tournamentEventsCache, tswId, data);
  return data;
}

export async function fetchTournamentEventDetail(
  tswId: string,
  eventId: number | string,
  refresh = false,
): Promise<TournamentEventDetailResponse> {
  const key = `${tswId}:${eventId}`;
  if (!refresh && tournamentEventDetailCache.has(key)) return tournamentEventDetailCache.get(key)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/event-detail?eventId=${encodeURIComponent(eventId)}`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament event detail API');

  const data: TournamentEventDetailResponse = await res.json();
  cappedSet(tournamentEventDetailCache, key, data);
  return data;
}

export async function fetchTournamentSeeding(
  tswId: string,
  refresh = false,
): Promise<TournamentSeedingResponse> {
  if (!refresh && tournamentSeedingCache.has(tswId)) return tournamentSeedingCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/seeds`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament seeds API');

  const data: TournamentSeedingResponse = await res.json();
  cappedSet(tournamentSeedingCache, tswId, data);
  return data;
}

// ── Tournament Winners ────────────────────────────────────────────────────────

const tournamentWinnersCache = new Map<string, TournamentWinnersResponse>();

export async function fetchTournamentWinners(
  tswId: string,
  refresh = false,
): Promise<TournamentWinnersResponse> {
  if (!refresh && tournamentWinnersCache.has(tswId)) return tournamentWinnersCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/winners`;
  const res = await fetchWithRetry(url, 60_000);
  if (!res.ok) await throwApiError(res, 'Tournament winners API');

  const data: TournamentWinnersResponse = await res.json();
  cappedSet(tournamentWinnersCache, tswId, data);
  return data;
}

// ── Tournament Medals ─────────────────────────────────────────────────────────

const tournamentMedalsCache = new Map<string, TournamentMedals>();

export async function fetchTournamentMedals(
  tswId: string,
  refresh = false,
): Promise<TournamentMedals> {
  if (!refresh && tournamentMedalsCache.has(tswId)) return tournamentMedalsCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/medals`;
  const res = await fetchWithRetry(url, 120_000);
  if (!res.ok) await throwApiError(res, 'Tournament medals API');

  const data: TournamentMedals = await res.json();
  cappedSet(tournamentMedalsCache, tswId, data);
  return data;
}

// ── Tournament Players ───────────────────────────────────────────────────────

const tournamentPlayersCache = new Map<string, TournamentPlayersResponse>();

export async function fetchTournamentPlayers(
  tswId: string,
  refresh = false,
): Promise<TournamentPlayersResponse> {
  if (!refresh && tournamentPlayersCache.has(tswId)) return tournamentPlayersCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/players`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament players API');

  const data: TournamentPlayersResponse = await res.json();
  cappedSet(tournamentPlayersCache, tswId, data);
  return data;
}

// ── Tournament Player Detail ─────────────────────────────────────────────────

const tournamentPlayerDetailCache = new Map<string, TournamentPlayerDetailResponse>();

export async function fetchTournamentPlayerDetail(
  tswId: string,
  playerId: number | string,
  refresh = false,
): Promise<TournamentPlayerDetailResponse> {
  const key = `${tswId}:${playerId}`;
  if (!refresh && tournamentPlayerDetailCache.has(key)) return tournamentPlayerDetailCache.get(key)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/player-detail?playerId=${encodeURIComponent(playerId)}`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament player detail API');

  const data: TournamentPlayerDetailResponse = await res.json();
  cappedSet(tournamentPlayerDetailCache, key, data);
  return data;
}

// ── Tournament Tab Fetchers ──────────────────────────────────────────────────

const tournamentMatchDatesCache = new Map<string, TournamentMatchDatesResponse>();
const tournamentMatchDayCache = new Map<string, TournamentMatchDayResponse>();

export async function fetchTournamentMatchDates(
  tswId: string,
  refresh = false,
): Promise<TournamentMatchDatesResponse> {
  if (!refresh && tournamentMatchDatesCache.has(tswId)) return tournamentMatchDatesCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/matches`;
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament match dates API');

  const data: TournamentMatchDatesResponse = await res.json();
  cappedSet(tournamentMatchDatesCache, tswId, data);
  return data;
}

// ── Draw Bracket ──────────────────────────────────────────────────────────────

export type DrawResponse = EliminationDrawResponse | RoundRobinDrawResponse;

const drawBracketCache = new Map<string, DrawResponse>();

export async function fetchDrawBracket(
  tswId: string,
  drawId: number,
  refresh = false,
): Promise<DrawResponse> {
  const key = `${tswId}:${drawId}`;
  if (!refresh && drawBracketCache.has(key)) return drawBracketCache.get(key)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/draw-bracket?drawId=${drawId}`;
  const res = await fetchWithRetry(url, 60_000);
  if (!res.ok) await throwApiError(res, 'Draw bracket API');

  const data: DrawResponse = await res.json();
  cappedSet(drawBracketCache, key, data);
  return data;
}

export async function fetchTournamentMatchDay(
  tswId: string,
  dateParam: string,
  refresh = false,
): Promise<TournamentMatchDayResponse> {
  const cacheKey = `${tswId}:${dateParam}`;
  if (!refresh && tournamentMatchDayCache.has(cacheKey)) return tournamentMatchDayCache.get(cacheKey)!;

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/matches?d=${encodeURIComponent(dateParam)}`;
  if (refresh) url += '&refresh=1';
  const res = await fetchWithRetry(url, 60_000);
  if (!res.ok) await throwApiError(res, 'Tournament matches API');

  const data: TournamentMatchDayResponse = await res.json();
  cappedSet(tournamentMatchDayCache, cacheKey, data);
  return data;
}
