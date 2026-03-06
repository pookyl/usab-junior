import type {
  JuniorPlayer,
  JuniorPlayerDetail,
  TournamentEntry,
  AgeGroup,
  EventType,
  RankingsKey,
  H2HResult,
} from '../types/junior';
import { RANKINGS_DATE } from '../data/usaJuniorData';

// In-memory cache to avoid redundant requests within the same browser session
const cache = new Map<RankingsKey, JuniorPlayer[]>();

export async function fetchRankings(
  ageGroup: AgeGroup,
  eventType: EventType,
  date: string = RANKINGS_DATE,
): Promise<JuniorPlayer[]> {
  const key: RankingsKey = `${ageGroup}-${eventType}`;
  if (cache.has(key)) return cache.get(key)!;

  const url = `/api/rankings?age_group=${ageGroup}&category=${eventType}&date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const players: JuniorPlayer[] = await res.json();
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('No ranking data returned');
  }

  cache.set(key, players);
  return players;
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

    const history: TournamentEntry[] = await res.json();
    return {
      usabId,
      name: '',
      rank: 0,
      rankingPoints: 0,
      ageGroup,
      eventType,
      tournamentHistory: history,
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

export function tswSearchUrl(playerName: string) {
  return `https://www.tournamentsoftware.com/find?type=player&q=${encodeURIComponent(playerName)}`;
}

export function tswTournamentUrl(tournamentId: string) {
  return `https://www.tournamentsoftware.com/sport/tournament.aspx?id=${tournamentId}`;
}
