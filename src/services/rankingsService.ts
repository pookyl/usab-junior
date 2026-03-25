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
  RankingCategoryDetail,
  TournamentsResponse,
  SpotlightResponse,
  TournamentDetail,
  TournamentMedals,
  TournamentMatchDayResponse,
  TournamentPlayersResponse,
  TournamentEventsResponse,
  TournamentSeedingResponse,
  TournamentEventDetailResponse,
  TournamentPlayerDetailResponse,
  TournamentWinnersResponse,
  EliminationDrawResponse,
  RoundRobinDrawResponse,
  PlayerScheduleResponse,
  TournamentScheduleEntry,
  ScheduledTournament,
} from '../types/junior';
import { RANKINGS_DATE } from '../data/usaJuniorData';

interface TournamentMetaSnapshot {
  name: string;
  hostClub: string;
  startDate: string;
  endDate: string;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function isPerfLoggingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('usab:perf') === '1') return true;
  } catch {
    // Ignore localStorage access errors.
  }
  return new URLSearchParams(window.location.search).get('debugPerf') === '1';
}

function logPerf(label: string, details: Record<string, unknown>) {
  if (!isPerfLoggingEnabled()) return;
  console.info(`[perf:${label}]`, details);
}

async function parseJsonWithPerf<T>(
  res: Response,
  label: string,
  startedAt: number,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const parseStartedAt = nowMs();
  const data = await res.json();
  logPerf(label, {
    fetchMs: Number((parseStartedAt - startedAt).toFixed(1)),
    parseMs: Number((nowMs() - parseStartedAt).toFixed(1)),
    status: res.status,
    cache: res.headers.get('X-Cache') ?? res.headers.get('X-Source') ?? 'none',
    ...extra,
  });
  return data as T;
}

// ── Fetch with retry ────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, timeoutMs: number, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        detectTournamentCache(url, res);
        return res;
      }
      if (attempt >= retries) return res;
    } catch (err) {
      if (attempt >= retries) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  const maybeError = (body as { error?: unknown }).error;
  if (typeof maybeError === 'string' && maybeError) {
    throw new Error(maybeError);
  }
  if (
    maybeError
    && typeof maybeError === 'object'
    && 'message' in maybeError
    && typeof (maybeError as { message?: unknown }).message === 'string'
  ) {
    throw new Error((maybeError as { message: string }).message);
  }
  throw new Error(`${fallback} ${res.status}`);
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

// ── Tournament cache detection ──────────────────────────────────────────────
// Populated reactively via X-Source: cache headers on API responses.
const _cachedTournaments = new Set<string>();
const _cacheListeners = new Set<() => void>();
const TOURNAMENT_API_RE = /\/api\/tournaments\/([0-9A-Fa-f-]+)\//;

function detectTournamentCache(url: string, res: Response) {
  if (res.headers.get('X-Source') !== 'cache') return;
  const m = url.match(TOURNAMENT_API_RE);
  if (m) {
    const key = m[1].toUpperCase();
    if (!_cachedTournaments.has(key)) {
      _cachedTournaments.add(key);
      _cacheListeners.forEach(fn => fn());
    }
  }
}

export function isTournamentCached(tswId: string): boolean {
  return _cachedTournaments.has(tswId.toUpperCase());
}

export function subscribeTournamentCache(listener: () => void): () => void {
  _cacheListeners.add(listener);
  return () => _cacheListeners.delete(listener);
}

async function fetchTournamentApi<T>(
  apiUrl: string,
  timeoutMs: number,
  errorLabel: string,
): Promise<T> {
  const startedAt = nowMs();
  const res = await fetchWithRetry(apiUrl, timeoutMs);
  if (!res.ok) await throwApiError(res, errorLabel);
  return parseJsonWithPerf<T>(res, errorLabel, startedAt, { url: apiUrl });
}

// ── Module-level caches ─────────────────────────────────────────────────────
let cachedDatesCache: string[] | null = null;
let allPlayersCache: UniquePlayer[] | null = null;
let allPlayersCacheDate = '';
const tswStatsCache = new Map<string, TswPlayerStats>();
const trendCache = new Map<string, PlayerRankingTrend>();
const tournamentMetaCache = new Map<string, TournamentMetaSnapshot>();
let cachedDatesPromise: Promise<string[]> | null = null;
let directoryPromise: Promise<DirectoryPlayer[]> | null = null;

export interface FetchAllPlayersResult {
  players: UniquePlayer[];
  partial: boolean;
  failedCategories: string[];
}
let allPlayersCacheResult: FetchAllPlayersResult | null = null;

export function invalidateRankingsCache() {
  // Date changes should only invalidate rankings-specific payloads.
  allPlayersCache = null;
  allPlayersCacheDate = '';
  allPlayersCacheResult = null;
}

// ── Player directory (cumulative across all dates, NOT invalidated on date change)

let directoryCache: DirectoryPlayer[] | null = null;

export async function fetchPlayerDirectory(): Promise<DirectoryPlayer[]> {
  if (directoryCache) return directoryCache;
  if (directoryPromise) return directoryPromise;

  directoryPromise = (async () => {
    const startedAt = nowMs();
    try {
      const res = await fetchWithRetry('/api/player-directory', 30_000);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await parseJsonWithPerf<DirectoryPlayer[]>(res, 'player-directory', startedAt);
      if (Array.isArray(data) && data.length > 0) {
        directoryCache = data;
        return data;
      }
    } catch (err) {
      console.warn('[rankingsService] player-directory unavailable:', err);
    }
    return [];
  })();

  try {
    return await directoryPromise;
  } finally {
    directoryPromise = null;
  }
}

// ── Cached dates (only dates with files on disk) ────────────────────────────

export async function fetchCachedDates(): Promise<string[]> {
  if (cachedDatesCache) return cachedDatesCache;
  if (cachedDatesPromise) return cachedDatesPromise;

  cachedDatesPromise = (async () => {
    const startedAt = nowMs();
    try {
      const res = await fetchWithRetry('/api/cached-dates', 10_000);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await parseJsonWithPerf<{ dates?: string[] }>(res, 'cached-dates', startedAt);
      if (Array.isArray(data.dates) && data.dates.length > 0) {
        cachedDatesCache = data.dates;
        return data.dates;
      }
    } catch (err) {
      console.warn('[rankingsService] cached-dates unavailable:', err);
    }
    return [RANKINGS_DATE];
  })();

  try {
    return await cachedDatesPromise;
  } finally {
    cachedDatesPromise = null;
  }
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

export async function fetchPlayerRankingDetail(
  usabId: string,
  date: string = RANKINGS_DATE,
): Promise<RankingCategoryDetail[]> {
  const url = `/api/player/${usabId}/ranking-detail?date=${date}`;
  const res = await fetchWithRetry(url, 30_000, 1);
  if (!res.ok) await throwApiError(res, 'Ranking detail API');
  const data = await res.json();
  return data.sections ?? [];
}

export function usabPlayerUrl(
  usabId: string,
  ageGroup: AgeGroup,
  eventType: EventType,
  date = RANKINGS_DATE,
) {
  return `https://usabjrrankings.org/${usabId}/details?age_group=${ageGroup}&category=${eventType}&date=${date}`;
}

export function usabPlayerBaseUrl(usabId: string, date = RANKINGS_DATE) {
  return `https://usabjrrankings.org/${usabId}/details?date=${date}`;
}

export async function fetchH2H(
  usabId1: string,
  usabId2: string,
): Promise<H2HResult> {
  const url = `/api/h2h?player1=${usabId1}&player2=${usabId2}`;
  const res = await fetchWithRetry(url, 30_000, 1);
  if (!res.ok) await throwApiError(res, 'H2H API');
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
  const startedAt = nowMs();
  const res = await fetchWithRetry(url, 120_000);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const players = await parseJsonWithPerf<UniquePlayer[]>(res, 'all-players', startedAt, { date });
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
  const normalizedName = playerName.toLowerCase().replace(/\s+/g, ' ').trim();
  const cacheKey = `${usabId}:${normalizedName || '__unknown__'}`;
  if (tswStatsCache.has(cacheKey)) return tswStatsCache.get(cacheKey)!;

  const url = `/api/player/${usabId}/tsw-stats?name=${encodeURIComponent(playerName)}`;
  const startedAt = nowMs();
  const res = await fetchWithRetry(url, 60_000, 1);
  if (!res.ok) await throwApiError(res, 'TSW stats API');

  const stats = await parseJsonWithPerf<TswPlayerStats>(res, 'tsw-stats', startedAt, { usabId });
  cappedSet(tswStatsCache, cacheKey, stats);
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
  const startedAt = nowMs();
  const res = await fetchWithRetry(url, 30_000, 1);
  if (!res.ok) await throwApiError(res, 'Trend API');

  const data = await parseJsonWithPerf<PlayerRankingTrend>(res, 'ranking-trend', startedAt, { usabId });
  cappedSet(trendCache, usabId, data);
  return data;
}

// ── Tournaments ──────────────────────────────────────────────────────────────

let tournamentsCache: TournamentsResponse | null = null;
let tournamentsCacheSeason = '';
let tournamentsCacheTs = 0;
const TOURNAMENTS_CACHE_TTL_MS = 60_000;

function rememberTournamentMeta(entries: ScheduledTournament[]) {
  for (const tournament of entries) {
    const tswId = tournament.tswId?.toUpperCase();
    if (!tswId) continue;
    tournamentMetaCache.set(tswId, {
      name: tournament.name,
      hostClub: tournament.hostClub,
      startDate: tournament.startDate ?? '',
      endDate: tournament.endDate ?? '',
    });
  }
}

export function getTournamentMetaSnapshot(tswId: string | undefined): TournamentMetaSnapshot | null {
  if (!tswId) return null;
  return tournamentMetaCache.get(tswId.toUpperCase()) ?? null;
}

export async function ensureTournamentMeta(tswId: string | undefined): Promise<TournamentMetaSnapshot | null> {
  if (!tswId) return null;
  const cached = getTournamentMetaSnapshot(tswId);
  if (cached) return cached;

  const data = await fetchTournaments();
  const tournaments = data.tournaments
    ?? Object.values(data.seasons ?? {}).flatMap((season) => season.tournaments);
  rememberTournamentMeta(tournaments);
  return getTournamentMetaSnapshot(tswId);
}

export async function fetchTournaments(
  season?: string,
): Promise<TournamentsResponse> {
  const cacheKey = season || '__all__';
  if (
    tournamentsCache
    && tournamentsCacheSeason === cacheKey
    && (Date.now() - tournamentsCacheTs) < TOURNAMENTS_CACHE_TTL_MS
  ) {
    return tournamentsCache;
  }

  const url = season ? `/api/tournaments?season=${encodeURIComponent(season)}` : '/api/tournaments';
  const startedAt = nowMs();
  const res = await fetchWithRetry(url, 15_000);
  if (!res.ok) await throwApiError(res, 'Tournaments API');

  const data = await parseJsonWithPerf<TournamentsResponse>(res, 'tournaments', startedAt, { season: cacheKey });
  const tournaments = data.tournaments
    ?? Object.values(data.seasons ?? {}).flatMap((seasonData) => seasonData.tournaments);
  rememberTournamentMeta(tournaments);
  tournamentsCache = data;
  tournamentsCacheSeason = cacheKey;
  tournamentsCacheTs = Date.now();
  return data;
}

let spotlightCache: SpotlightResponse | null = null;
let spotlightCacheTs = 0;

export async function fetchSpotlight(): Promise<SpotlightResponse> {
  if (spotlightCache && (Date.now() - spotlightCacheTs) < TOURNAMENTS_CACHE_TTL_MS) {
    return spotlightCache;
  }

  const startedAt = nowMs();
  const res = await fetchWithRetry('/api/tournaments?spotlight=true', 15_000);
  if (!res.ok) await throwApiError(res, 'Spotlight API');

  const data = await parseJsonWithPerf<SpotlightResponse>(res, 'spotlight', startedAt);
  spotlightCache = data;
  spotlightCacheTs = Date.now();
  return data;
}

const tournamentDetailCache = new Map<string, TournamentDetail>();

export async function fetchTournamentDetail(
  tswId: string,
  refresh = false,
): Promise<TournamentDetail> {
  if (!refresh && tournamentDetailCache.has(tswId)) return tournamentDetailCache.get(tswId)!;

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/detail`;
  if (refresh) url += '?refresh=1';
  const data = await fetchTournamentApi<TournamentDetail>(url, 30_000, 'Tournament detail API');
  cappedSet(tournamentDetailCache, tswId, data);
  return data;
}

// ── Tournament Schedule ──────────────────────────────────────────────────────

const tournamentScheduleCache = new Map<string, TournamentScheduleEntry[]>();

export async function fetchTournamentSchedule(
  tswId: string,
): Promise<TournamentScheduleEntry[]> {
  if (tournamentScheduleCache.has(tswId)) return tournamentScheduleCache.get(tswId)!;

  const url = `/api/tournaments/${encodeURIComponent(tswId)}/schedule`;
  const data = await fetchTournamentApi<{ tswId: string; schedule: TournamentScheduleEntry[] }>(url, 15_000, 'Tournament schedule API');
  cappedSet(tournamentScheduleCache, tswId, data.schedule);
  return data.schedule;
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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/events`;
  if (refresh) url += '?refresh=1';
  const data = await fetchTournamentApi<TournamentEventsResponse>(url, 30_000, 'Tournament events API');
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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/event-detail?eventId=${encodeURIComponent(eventId)}`;
  if (refresh) url += '&refresh=1';
  const data = await fetchTournamentApi<TournamentEventDetailResponse>(url, 30_000, 'Tournament event detail API');
  cappedSet(tournamentEventDetailCache, key, data);
  return data;
}

export async function fetchTournamentSeeding(
  tswId: string,
  refresh = false,
): Promise<TournamentSeedingResponse> {
  if (!refresh && tournamentSeedingCache.has(tswId)) return tournamentSeedingCache.get(tswId)!;

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/seeds`;
  if (refresh) url += '?refresh=1';
  const data = await fetchTournamentApi<TournamentSeedingResponse>(url, 30_000, 'Tournament seeds API');
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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/winners`;
  if (refresh) url += '?refresh=1';
  const data = await fetchTournamentApi<TournamentWinnersResponse>(url, 60_000, 'Tournament winners API');
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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/medals`;
  if (refresh) url += '?refresh=1';
  const data = await fetchTournamentApi<TournamentMedals>(url, 120_000, 'Tournament medals API');
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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/players`;
  if (refresh) url += '?refresh=1';
  const data = await fetchTournamentApi<TournamentPlayersResponse>(url, 30_000, 'Tournament players API');
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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/player-detail?playerId=${encodeURIComponent(playerId)}`;
  if (refresh) url += '&refresh=1';
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Tournament player detail API');

  const data: TournamentPlayerDetailResponse = await res.json();
  cappedSet(tournamentPlayerDetailCache, key, data);
  return data;
}

// ── Tournament Tab Fetchers ──────────────────────────────────────────────────

const tournamentMatchDayCache = new Map<string, TournamentMatchDayResponse>();

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

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/draw-bracket?drawId=${drawId}`;
  if (refresh) url += '&refresh=1';
  const data = await fetchTournamentApi<DrawResponse>(url, 60_000, 'Draw bracket API');
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
  const data = await fetchTournamentApi<TournamentMatchDayResponse>(url, 60_000, 'Tournament matches API');
  cappedSet(tournamentMatchDayCache, cacheKey, data);
  return data;
}

// ── Player Schedule ──────────────────────────────────────────────────────────

const playerScheduleCache = new Map<string, PlayerScheduleResponse>();

export async function fetchPlayerSchedule(
  tswId: string,
  playerIds: (number | string)[],
  refresh = false,
): Promise<PlayerScheduleResponse> {
  const ids = playerIds.map(String).sort().join(',');
  const key = `${tswId}:${ids}`;
  if (!refresh && playerScheduleCache.has(key)) return playerScheduleCache.get(key)!;

  let url = `/api/tournaments/${encodeURIComponent(tswId)}/player-schedule?playerIds=${encodeURIComponent(ids)}`;
  if (refresh) url += '&refresh=1';
  const res = await fetchWithRetry(url, 30_000);
  if (!res.ok) await throwApiError(res, 'Player schedule API');

  const data: PlayerScheduleResponse = await res.json();
  cappedSet(playerScheduleCache, key, data);
  return data;
}
